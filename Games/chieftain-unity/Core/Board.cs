using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>
    /// 판 위의 땅 — 칸·다리·점령·안개.
    ///
    /// <para>
    /// 유닛과 전투는 <see cref="Game"/>이 맡고 여기는 **땅만** 안다. 갈라둔 이유는
    /// 땅의 규칙이 유닛의 규칙보다 훨씬 오래 살아남기 때문이다. 맵이 사막으로
    /// 바뀌어도 점령과 안개는 그대로지만, 유닛과 중립은 통째로 갈린다.
    /// </para>
    /// </summary>
    public sealed class Board
    {
        /// <summary>다리 통로의 반폭. 유닛 지름보다 조금 넓어 두세 명이 겨우 지난다.</summary>
        private const double BridgeHalf = 3.2;

        public readonly List<Tile> Tiles = new List<Tile>();
        public readonly List<TileDef> Defs;
        /// <summary>칸 id → 이웃 칸 id들. 매 틱 다시 계산할 이유가 없어 한 번만 만든다.</summary>
        public readonly List<List<int>> Adj = new List<List<int>>();

        public readonly List<(TileDef A, TileDef B)> Bridges = new List<(TileDef, TileDef)>();

        public Board(uint seed, int keepP0, int keepP1)
        {
            Defs = Fjord.MakeTiles();
            foreach (var d in Defs) Adj.Add(Fjord.NeighborsOf(d.Col, d.Row));

            var neutrals = Fjord.PlaceNeutrals(seed);
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
            BuildBridges();
        }

        public Tile At(int id) => Tiles[id];

        private static bool PointNearSegment(Vec2 p, TileDef a, TileDef b, double half)
        {
            double dx = b.X - a.X;
            double dz = b.Z - a.Z;
            double l2 = dx * dx + dz * dz;
            if (l2 < 1e-6) return false;
            double t = ((p.X - a.X) * dx + (p.Z - a.Z) * dz) / l2;
            t = Det.Clamp(t, 0, 1);
            double cx = a.X + dx * t;
            double cz = a.Z + dz * t;
            return Det.Hypot(p.X - cx, p.Z - cz) <= half;
        }

        /// <summary>
        /// 월드 좌표가 속한 칸. 물 위라면 가장 가까운 칸을 돌려준다 —
        /// 다리 위에 서 있는 유닛도 어딘가에는 속해야 하기 때문이다.
        /// </summary>
        public int TileAt(Vec2 p)
        {
            int best = 0;
            double bestD = double.PositiveInfinity;
            foreach (var d in Defs)
            {
                double dd = Math.Max(Math.Abs(p.X - d.X), Math.Abs(p.Z - d.Z));
                if (dd < bestD)
                {
                    bestD = dd;
                    best = d.Id;
                }
            }
            return best;
        }

        /// <summary>칸 안의 한 점을 땅 위로 밀어 넣는다. 물에 빠지지 않게 하는 유일한 장치다.</summary>
        public Vec2 ClampToLand(int id, Vec2 p)
        {
            var d = Defs[id];
            double h = Fjord.TileLand / 2;
            return new Vec2(Det.Clamp(p.X, d.X - h, d.X + h), Det.Clamp(p.Z, d.Z - h, d.Z + h));
        }

        private void BuildBridges()
        {
            foreach (var d in Defs)
            {
                foreach (var n in Adj[d.Id])
                {
                    if (n < d.Id) continue; // 한 쌍을 한 번만
                    Bridges.Add((d, Defs[n]));
                }
            }
        }

        /// <summary>걸을 수 있는 곳인가 — 땅이거나 다리 위.</summary>
        public bool IsWalkable(Vec2 p)
        {
            if (IsOnLand(p)) return true;
            foreach (var br in Bridges)
            {
                if (PointNearSegment(p, br.A, br.B, BridgeHalf)) return true;
            }
            return false;
        }

        public bool IsOnLand(Vec2 p)
        {
            var d = Defs[TileAt(p)];
            double h = Fjord.TileLand / 2;
            return Math.Abs(p.X - d.X) <= h && Math.Abs(p.Z - d.Z) <= h;
        }

        /// <summary>
        /// 칸에서 칸으로 가는 경유지.
        ///
        /// <para>
        /// 이웃 칸으로 넘어갈 때는 반드시 **다리**를 지난다(GDD 6.2의 "좁은 통로").
        /// 그래서 경로는 <c>다리 → 칸 중심 → 다리 → …</c>가 되고, 두 부대가 다른
        /// 칸에서 같은 칸으로 들어오면 다리 앞에서 만나게 된다.
        /// </para>
        /// </summary>
        public List<Vec2> Route(int fromTile, int toTile, Vec2? finalPoint = null)
        {
            var path = TilePath(fromTile, toTile);
            var outp = new List<Vec2>();
            for (int i = 0; i + 1 < path.Count; i++)
            {
                var a = Defs[path[i]];
                var b = Defs[path[i + 1]];
                outp.Add(Fjord.BridgeBetween(a, b));
                // 마지막 칸의 중심은 아래에서 finalPoint로 대체될 수 있다.
                if (i + 2 < path.Count) outp.Add(new Vec2(b.X, b.Z));
            }
            var last = Defs[toTile];
            outp.Add(finalPoint.HasValue
                ? ClampToLand(toTile, finalPoint.Value)
                : new Vec2(last.X, last.Z));
            return outp;
        }

        /// <summary>칸 단위 최단 경로 (BFS). 아홉 칸이라 이보다 영리할 필요가 없다.</summary>
        public List<int> TilePath(int from, int to)
        {
            if (from == to) return new List<int> { from };
            var prev = new Dictionary<int, int> { [from] = -1 };
            var queue = new List<int> { from };
            for (int head = 0; head < queue.Count; head++)
            {
                int cur = queue[head];
                if (cur == to) break;
                foreach (var n in Adj[cur])
                {
                    if (prev.ContainsKey(n)) continue;
                    prev[n] = cur;
                    queue.Add(n);
                }
            }
            if (!prev.ContainsKey(to)) return new List<int> { from };
            var outp = new List<int>();
            for (int cur = to; cur != -1; cur = prev[cur]) outp.Add(cur);
            outp.Reverse();
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
            double half = Fjord.TileLand / 2;
            foreach (var d in Defs)
            {
                foreach (var s in sources)
                {
                    double dx = Math.Max(0, Math.Abs(s.Pos.X - d.X) - half);
                    double dz = Math.Max(0, Math.Abs(s.Pos.Z - d.Z) - half);
                    if (Det.Hypot(dx, dz) <= s.Radius)
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
        public int Mirror(int id) => Fjord.MirrorOf(id);
    }
}
