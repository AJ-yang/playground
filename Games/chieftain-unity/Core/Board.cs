using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    
    ///
    /// <para>
    /// 유닛과 전투는 <see cref="Game"/>이 맡고 여기는 **땅만** 안다. 갈라둔 이유는
    /// 땅의 규칙이 유닛의 규칙보다 훨씬 오래 살아남기 때문이다. 맵이 사막으로
    /// 바뀌어도 점령과 안개는 그대로지만, 유닛과 중립은 통째로 갈린다.
    /// </para>
    /// </summary>
    /// <summary>
    /// 판 위의 땅 — 지역·통행·점령·안개.
    ///
    /// <para>
    /// 전에는 물 위에 뜬 아홉 개의 섬이었고 경로도 다리를 순서대로 지나면 됐다.
    /// 지금은 하나로 이어진 넓은 땅이라(<c>Data/Land.cs</c>) 길을 실제로 찾아야
    /// 한다. 대신 점령·안개·수입·일꾼은 **지역** 단위로 그대로 돈다.
    /// </para>
    /// <para>
    /// **대표점(anchor)이 필요한 이유**: 지역 중심이 물일 수 있다(한가운데 호수).
    /// 본진 위치·집결 기본값·AI 목표가 전부 "그 지역의 한 점"을 필요로 하는데,
    /// 중심을 그대로 쓰면 유닛이 물로 걸어간다.
    /// </para>
    /// </summary>
    public sealed class Board
    {
        public readonly List<Tile> Tiles = new List<Tile>();
        public readonly List<RegionDef> Defs;
        /// <summary>지역 id → 이웃 지역 id들.</summary>
        public readonly List<List<int>> Adj = new List<List<int>>();
        /// <summary>이 판의 땅. 걸을 수 있는 곳이 여기 정의되어 있다.</summary>
        public readonly Land Land;

        /// <summary>지역마다 하나씩. 중심이 물이면 가장 가까운 땅으로 밀어 둔 점이다.</summary>
        private readonly List<Vec2> _anchors = new List<Vec2>();
        /// <summary>지역 사이의 걸어서 거리(지역 수). 물을 돌아가는 거리다.</summary>
        private readonly int[][] _hops;

        public Board(uint seed, int keepP0, int keepP1)
        {
            Defs = LandMap.MakeRegions();
            foreach (var d in Defs) Adj.Add(LandMap.NeighborsOf(d.Col, d.Row));
            Land = new Land(seed);

            foreach (var d in Defs) _anchors.Add(Land.NearestWalkable(new Vec2(d.X, d.Z)));
            _hops = BuildHops();

            var neutrals = LandMap.PlaceNeutrals(seed);
            foreach (var def in Defs)
            {
                bool has = neutrals.TryGetValue(def.Id, out var kind);
                Tiles.Add(new Tile
                {
                    Def = def,
                    Hold = def.Id == keepP0 ? 1 : def.Id == keepP1 ? -1 : 0,
                    Owner = def.Id == keepP0 ? 0 : def.Id == keepP1 ? 1 : Faction.Nobody,
                    Neutral = has
                        ? new NeutralCamp { Tile = def.Id, Kind = kind, Cleared = false, LastDamager = Faction.Nobody }
                        : null,
                    Outpost = false,
                    Seen = new bool[2],
                });
            }
        }

        public Tile At(int id) => Tiles[id];

        /// <summary>이 지역의 대표점. 늘 땅이다.</summary>
        public Vec2 Anchor(int id) => _anchors[id];

        /// <summary>월드 좌표가 속한 지역.</summary>
        public int TileAt(Vec2 p) => LandMap.RegionAt(p.X, p.Z);

        public bool IsWalkable(Vec2 p) => Land.WalkableAt(p);
        public bool IsOnLand(Vec2 p) => Land.WalkableAt(p);

        /// <summary>이 점을 땅 위로 끌어낸다. 지역 경계는 이제 아무것도 막지 않는다.</summary>
        public Vec2 ClampToLand(Vec2 p) => Land.WalkableAt(p) ? p : Land.NearestWalkable(p);

        /// <summary>
        /// 한 걸음 옮긴 자리를 땅 안에서 받아 준다. 못 가는 곳이면 축을 하나씩
        /// 시험해 벽을 따라 미끄러지게 한다.
        /// </summary>
        public Vec2 Slide(Vec2 from, Vec2 to)
        {
            if (Land.WalkableAt(to)) return to;
            var sx = new Vec2(to.X, from.Z);
            if (Land.WalkableAt(sx)) return sx;
            var sz = new Vec2(from.X, to.Z);
            if (Land.WalkableAt(sz)) return sz;
            return from;
        }

        /// <summary>경유지 목록. 다리를 순서대로 지나던 예전과 달리 실제로 길을 찾는다.</summary>
        public List<Vec2> Route(Vec2 from, Vec2 to) => Path.Find(Land, from, to);

        /// <summary>
        /// 지역 사이의 걸어서 거리(지역 수). 격자 거리로 재면 안 된다 — 한가운데
        /// 호수를 사이에 둔 두 지역은 격자로는 이웃이지만 실제로는 크게 돌아야 한다.
        /// </summary>
        public List<int> TilePath(int from, int to)
        {
            // 예전 시그니처를 지킨다 — 부르는 쪽이 Count만 본다.
            int n = _hops[from][to];
            var outp = new List<int>();
            for (int i = 0; i <= n; i++) outp.Add(from);
            return outp;
        }

        private int[][] BuildHops()
        {
            int n = Defs.Count;
            var outp = new int[n][];
            var dist = new int[LandMap.NavCols * LandMap.NavRows];
            var queue = new int[LandMap.NavCols * LandMap.NavRows];
            int[] dxs = { -1, 1, 0, 0 };
            int[] dzs = { 0, 0, -1, 1 };

            for (int src = 0; src < n; src++)
            {
                for (int i = 0; i < dist.Length; i++) dist[i] = -1;
                int head = 0;
                int tail = 0;
                var a = _anchors[src];
                int si = LandMap.NavRow(a.Z) * LandMap.NavCols + LandMap.NavCol(a.X);
                dist[si] = 0;
                queue[tail++] = si;

                while (head < tail)
                {
                    int cur = queue[head++];
                    int cx = cur % LandMap.NavCols;
                    int cz = (cur - cx) / LandMap.NavCols;
                    for (int k = 0; k < 4; k++)
                    {
                        int nx = cx + dxs[k];
                        int nz = cz + dzs[k];
                        if (nx < 0 || nz < 0 || nx >= LandMap.NavCols || nz >= LandMap.NavRows) continue;
                        int ni = nz * LandMap.NavCols + nx;
                        if (dist[ni] != -1 || Land.Walk[ni] != 1) continue;
                        dist[ni] = dist[cur] + 1;
                        queue[tail++] = ni;
                    }
                }

                var row = new int[n];
                for (int dst = 0; dst < n; dst++)
                {
                    var b = _anchors[dst];
                    int di = LandMap.NavRow(b.Z) * LandMap.NavCols + LandMap.NavCol(b.X);
                    int cells = dist[di];
                    row[dst] = cells < 0 ? 99 : (int)Math.Round((cells * 2.5) / LandMap.Region);
                }
                outp[src] = row;
            }
            return outp;
        }

        /// <summary>
        /// 점령 진행 (GDD 4.3).
        ///
        /// <para>
        /// 한쪽 유닛만 서 있을 때 차오르고, 양쪽이 겹치거나 중립 캠프가 살아 있으면
        /// 멈춘다. **점령은 싸움이 끝난 뒤에 일어나는 일**이라는 뜻이다.
        /// </para>
        /// </summary>
        public void UpdateCapture(int id, int p0, int p1, double dt)
        {
            var t = Tiles[id];
            if (t.Neutral != null && !t.Neutral.Cleared) return;

            int only = p0 > 0 && p1 == 0 ? 0 : p1 > 0 && p0 == 0 ? 1 : Faction.Nobody;
            if (only == Faction.Nobody) return;

            int toward = only == 0 ? 1 : -1;
            // 지금 점유도가 상대 쪽으로 기울어 있으면 되찾는 것이므로 느리다.
            bool contested = Det.Sign(t.Hold) == -toward && t.Hold != 0;
            double rate = 1 / (contested ? Tuning.DecaySeconds : Tuning.CaptureSeconds);
            t.Hold = Det.Clamp(t.Hold + toward * rate * dt, -1, 1);

            int owner = t.Hold >= 0.999 ? 0 : t.Hold <= -0.999 ? 1 : Faction.Nobody;
            if (owner != t.Owner)
            {
                t.Owner = owner;
                // 무너진 돌성채는 점령한 순간 전초가 된다(GDD 4.3).
                if (owner != Faction.Nobody && t.Neutral?.Kind == NeutralKind.Ruin
                    && FjordNeutrals.Ruin.GrantsOutpost)
                {
                    t.Outpost = true;
                }
            }
        }

        public int OwnedBy(int side)
        {
            int n = 0;
            foreach (var t in Tiles) if (t.Owner == side) n++;
            return n;
        }

        /// <summary>
        /// 안개 (GDD 4.1). 시야원이 칸의 **땅 사각형**에 닿으면 그 칸이 보인다.
        ///
        /// <para>
        /// 중심 거리로 근사하면 칸 한가운데 서 있기만 해도 이웃이 전부 열려서
        /// 안개가 사실상 없어진다. 이웃을 보려면 다리 쪽으로 나가야 한다 — 그게 탐험이다.
        /// </para>
        /// </summary>
        public HashSet<int> ComputeVisible(List<(Vec2 Pos, double Radius)> sources, int side)
        {
            var vis = new HashSet<int>();
            foreach (var d in Defs)
            {
                foreach (var s in sources)
                {
                    // **지역 중심까지의 거리**로 잰다. 지역이 60으로 커진 뒤로
                    // 사각형까지의 거리로 재면 본진에 앉아만 있어도 이웃이 열린다.
                    if (Det.Hypot(s.Pos.X - d.X, s.Pos.Z - d.Z) <= s.Radius)
                    {
                        vis.Add(d.Id);
                        break;
                    }
                }
            }
            foreach (var id in vis) Tiles[id].Seen[side] = true;
            return vis;
        }

        /// <summary>디버그·AI용. 거울상 대칭이 실제로 지켜지는지 확인할 때 쓴다.</summary>
        public int Mirror(int id) => LandMap.MirrorOf(id);
    }
}
