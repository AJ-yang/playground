using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>
    /// 하나로 이어진 땅. TypeScript <c>data/land.ts</c>와 **연산 순서까지 같은 짝**이다.
    ///
    /// <para>
    /// 전에는 물 위에 뜬 아홉 개의 섬이었고 이웃 섬은 다리 하나로만 이어졌다.
    /// 지금은 하나로 이어진 넓은 땅이고, 길목은 다리가 아니라 **바다가 파고든 만**이
    /// 만든다.
    /// </para>
    /// <para>
    /// 격자가 **둘**이고 헷갈리면 안 된다. 지역(5×3, 한 변 60)은 점령·안개·수입·
    /// 일꾼 정원·AI 목표에 쓰고, 통행 격자(120×72, 한 칸 2.5)는 걸을 수 있나·
    /// 길찾기에 쓴다.
    /// </para>
    /// <para>
    /// **여기서 만드는 것은 전부 시뮬레이션 입력이다.** 통행 격자가 한 칸이라도
    /// 다르면 두 클라이언트의 길이 갈라지므로, 모양을 잡음이 아니라 도형으로
    /// 만든다 — 사칙연산과 비교만 쓰므로 TS 원본과 비트까지 같다.
    /// </para>
    /// </summary>
    public sealed class RegionDef
    {
        public int Id;
        public int Col;
        public int Row;
        /// <summary>지역 중심의 월드 좌표. 맵 중앙이 원점이다.</summary>
        public double X;
        public double Z;
    }

    public static class LandMap
    {
        public const int Cols = 5;
        public const int Rows = 3;

        /// <summary>지역 한 변(월드 단위).</summary>
        public const double Region = 60;

        public const double MapW = Cols * Region;
        public const double MapH = Rows * Region;
        private const double HalfW = MapW / 2;
        private const double HalfH = MapH / 2;

        public static int RegionId(int col, int row) => row * Cols + col;

        public static readonly int KeepP0 = RegionId(0, 1);
        public static readonly int KeepP1 = RegionId(Cols - 1, 1);
        public static readonly int Center = RegionId(2, 1);

        public static List<RegionDef> MakeRegions()
        {
            var outp = new List<RegionDef>();
            for (int row = 0; row < Rows; row++)
            {
                for (int col = 0; col < Cols; col++)
                {
                    outp.Add(new RegionDef
                    {
                        Id = RegionId(col, row),
                        Col = col,
                        Row = row,
                        X = (col - (Cols - 1) / 2.0) * Region,
                        Z = (row - (Rows - 1) / 2.0) * Region,
                    });
                }
            }
            return outp;
        }

        /// <summary>4방 인접. 대각선을 빼는 것은 AI의 거리 감각을 단순하게 두기 위해서다.</summary>
        public static List<int> NeighborsOf(int col, int row)
        {
            var outp = new List<int>();
            if (col > 0) outp.Add(RegionId(col - 1, row));
            if (col < Cols - 1) outp.Add(RegionId(col + 1, row));
            if (row > 0) outp.Add(RegionId(col, row - 1));
            if (row < Rows - 1) outp.Add(RegionId(col, row + 1));
            return outp;
        }

        /// <summary>180° 회전 대칭의 짝 (GDD 4.2).</summary>
        public static int MirrorOf(int id)
        {
            int col = id % Cols;
            int row = id / Cols;
            return RegionId(Cols - 1 - col, Rows - 1 - row);
        }

        /// <summary>월드 좌표가 속한 지역. 맵 밖이면 가장자리 지역으로 물린다.</summary>
        public static int RegionAt(double x, double z)
        {
            int col = (int)Math.Floor((x + HalfW) / Region);
            int row = (int)Math.Floor((z + HalfH) / Region);
            if (col < 0) col = 0; else if (col > Cols - 1) col = Cols - 1;
            if (row < 0) row = 0; else if (row > Rows - 1) row = Rows - 1;
            return RegionId(col, row);
        }

        // ─────────────────────────────────────────────── 통행 격자

        /// <summary>통행 격자 한 칸의 크기. 유닛 지름(~2)보다 조금 크다.</summary>
        public const double Nav = 2.5;

        public static readonly int NavCols = (int)Math.Round(MapW / Nav);
        public static readonly int NavRows = (int)Math.Round(MapH / Nav);

        public static double NavX(int cx) => -HalfW + (cx + 0.5) * Nav;
        public static double NavZ(int cz) => -HalfH + (cz + 0.5) * Nav;

        public static int NavCol(double x)
        {
            int c = (int)Math.Floor((x + HalfW) / Nav);
            return c < 0 ? 0 : c > NavCols - 1 ? NavCols - 1 : c;
        }

        public static int NavRow(double z)
        {
            int r = (int)Math.Floor((z + HalfH) / Nav);
            return r < 0 ? 0 : r > NavRows - 1 ? NavRows - 1 : r;
        }

        // ─────────────────────────────────────────────── 중립 배치

        /// <summary>
        /// 중립 배치. **왼쪽 절반에서만 뽑고 회전 복사한다** (GDD 4.2).
        ///
        /// <para>
        /// 다섯 후보 중 셋을 뽑아 세 갈래를 하나씩 넣는다 — "무엇이 나오느냐"가
        /// 아니라 어디에 나오느냐만 무작위다. 가운데 열(호수가 있는 열)은 비운다.
        /// </para>
        /// </summary>
        public static Dictionary<int, NeutralKind> PlaceNeutrals(uint seed)
        {
            var rng = new Rng(seed);

            var candidates = new[]
            {
                RegionId(0, 0),
                RegionId(0, 2),
                RegionId(1, 0),
                RegionId(1, 1),
                RegionId(1, 2),
            };
            for (int i = candidates.Length - 1; i > 0; i--)
            {
                int k = rng.Int(0, i);
                (candidates[i], candidates[k]) = (candidates[k], candidates[i]);
            }

            var kinds = new[] { NeutralKind.Mercenary, NeutralKind.Creature, NeutralKind.Ruin };
            for (int i = kinds.Length - 1; i > 0; i--)
            {
                int k = rng.Int(0, i);
                (kinds[i], kinds[k]) = (kinds[k], kinds[i]);
            }

            var outp = new Dictionary<int, NeutralKind>();
            for (int i = 0; i < kinds.Length; i++)
            {
                int id = candidates[i];
                outp[id] = kinds[i];
                outp[MirrorOf(id)] = kinds[i];
            }
            return outp;
        }
    }

    /// <summary>바다가 파고든 만 하나. 선분에서 <c>R</c>만큼 떨어진 곳까지가 물이다.</summary>
    internal struct Inlet
    {
        public double Ax, Az, Bx, Bz, R;
    }

    /// <summary>
    /// 걸을 수 있는 곳인가 — **이 클래스가 이 맵의 정의다.**
    /// </summary>
    public sealed class Land
    {
        /// <summary>통행 가능 여부. <c>cz * NavCols + cx</c>.</summary>
        public readonly byte[] Walk;
        private readonly Inlet[] _inlets;
        /// <summary>해안 요철의 진동수. 위상이 아니라 이걸 흔들어야 대칭이 안 깨진다.</summary>
        private readonly double _fx;
        private readonly double _fz;

        /// <summary>맵 가장자리는 물이다. 이 여백이 없으면 "세상의 끝"이 보인다.</summary>
        private const double Coast = 16;
        /// <summary>해안을 들쭉날쭉하게 만드는 진폭.</summary>
        private const double CoastWobble = 7;

        public Land(uint seed)
        {
            _inlets = InletsFor(seed);
            var rng = new Rng(seed ^ 0x1f83d9abu);
            _fx = rng.Range(0.028, 0.046);
            _fz = rng.Range(0.040, 0.062);

            Walk = new byte[LandMap.NavCols * LandMap.NavRows];
            for (int cz = 0; cz < LandMap.NavRows; cz++)
            {
                for (int cx = 0; cx < LandMap.NavCols; cx++)
                {
                    Walk[cz * LandMap.NavCols + cx] =
                        (byte)(SolidAt(LandMap.NavX(cx), LandMap.NavZ(cz)) ? 1 : 0);
                }
            }
        }

        private static double DistToSegment(double px, double pz, in Inlet s)
        {
            double dx = s.Bx - s.Ax;
            double dz = s.Bz - s.Az;
            double l2 = dx * dx + dz * dz;
            double t = l2 < 1e-9 ? 0 : ((px - s.Ax) * dx + (pz - s.Az) * dz) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            return Det.Hypot(px - (s.Ax + dx * t), pz - (s.Az + dz * t));
        }

        /// <summary>
        /// 이 판의 만들. **왼쪽 절반만 놓고 180° 돌려 복사한다** (GDD 4.2).
        /// 자리는 고정이고 씨앗은 흔들기만 한다 — 길목의 위치는 늘 같다.
        /// </summary>
        private static Inlet[] InletsFor(uint seed)
        {
            var rng = new Rng(seed ^ 0x5bf03635u);
            double J(double m) => rng.Range(-m, m);

            var outp = new List<Inlet>();

            // 한가운데의 호수. 원점에 놓으면 180° 돌려도 자기 자신이라 복사할 필요가 없다.
            double lakeR = 24 + J(2);
            outp.Add(new Inlet { Ax = -6, Az = 0, Bx = 6, Bz = 0, R = lakeR });

            const double halfH = LandMap.MapH / 2;
            var half = new[]
            {
                // 북서쪽 만. 호수와의 사이에 좁은 목을 남긴다.
                new Inlet
                {
                    Ax = -52 + J(4), Az = -halfH - 12,
                    Bx = -48 + J(4), Bz = -34 + J(3), R = 13 + J(1),
                },
                // 본진 북쪽의 내륙 호수. 길을 막지는 않고 뒤를 좁힌다.
                new Inlet
                {
                    Ax = -92 + J(5), Az = 42 + J(4),
                    Bx = -82 + J(5), Bz = 46 + J(4), R = 11 + J(1),
                },
            };

            foreach (var s in half)
            {
                outp.Add(s);
                outp.Add(new Inlet { Ax = -s.Ax, Az = -s.Az, Bx = -s.Bx, Bz = -s.Bz, R = s.R });
            }
            return outp.ToArray();
        }

        /// <summary>
        /// 이 좌표가 땅인가.
        ///
        /// <para>
        /// 해안 요철을 **곱으로** 만드는 것이 핵심이다. <c>sin(x+φ) + sin(z+φ)</c>로
        /// 쓰면 (x,z) → (-x,-z)로 돌렸을 때 값이 달라져 한쪽 해안만 파인다 —
        /// 거울상 맵의 공정성이 그림에서부터 깨진다(GDD 4.2). 위상을 넣으면 다시
        /// 깨지므로 판마다 다르게 하려면 위상이 아니라 **진동수**를 흔든다.
        /// </para>
        /// </summary>
        public bool SolidAt(double x, double z)
        {
            double wob =
                Det.Sin(x * _fx) * Det.Sin(z * _fz) * CoastWobble +
                Det.Sin(x * _fx * 2.3) * Det.Sin(z * _fz * 1.7) * CoastWobble * 0.4;
            if (Math.Abs(x) > LandMap.MapW / 2 - Coast + wob) return false;
            if (Math.Abs(z) > LandMap.MapH / 2 - Coast + wob * 0.7) return false;

            foreach (var s in _inlets)
            {
                if (DistToSegment(x, z, s) < s.R) return false;
            }
            return true;
        }

        public bool WalkableCell(int cx, int cz)
        {
            if (cx < 0 || cz < 0 || cx >= LandMap.NavCols || cz >= LandMap.NavRows) return false;
            return Walk[cz * LandMap.NavCols + cx] == 1;
        }

        public bool WalkableAt(Vec2 p) => WalkableCell(LandMap.NavCol(p.X), LandMap.NavRow(p.Z));

        /// <summary>
        /// 가장 가까운 걸을 수 있는 자리. 바깥으로 한 겹씩 넓혀 가며 찾으므로 가장
        /// 가까운 칸이 나오고, 같은 거리면 낮은 인덱스가 이긴다 — 양쪽 런타임이
        /// 같은 답을 내야 하기 때문이다.
        /// </summary>
        public Vec2 NearestWalkable(Vec2 p)
        {
            if (WalkableAt(p)) return p;
            int cx = LandMap.NavCol(p.X);
            int cz = LandMap.NavRow(p.Z);
            for (int ring = 1; ring < 24; ring++)
            {
                int best = -1;
                double bestD = double.PositiveInfinity;
                for (int dz = -ring; dz <= ring; dz++)
                {
                    for (int dx = -ring; dx <= ring; dx++)
                    {
                        if (Math.Abs(dx) != ring && Math.Abs(dz) != ring) continue;
                        int nx = cx + dx;
                        int nz = cz + dz;
                        if (!WalkableCell(nx, nz)) continue;
                        double d = Det.Hypot(LandMap.NavX(nx) - p.X, LandMap.NavZ(nz) - p.Z);
                        int idx = nz * LandMap.NavCols + nx;
                        if (d < bestD)
                        {
                            bestD = d;
                            best = idx;
                        }
                    }
                }
                if (best >= 0)
                {
                    return new Vec2(
                        LandMap.NavX(best % LandMap.NavCols),
                        LandMap.NavZ(best / LandMap.NavCols));
                }
            }
            return new Vec2(0, 0);
        }
    }

    /// <summary>
    /// 길찾기 — 통행 격자 위의 너비 우선 탐색.
    ///
    /// <para>
    /// 다익스트라도 A*도 아니고 BFS인 것은 칸 비용이 전부 같기 때문이다. 비용이
    /// 같으면 BFS가 곧 최단 경로고, 우선순위 큐가 없으니 순서가 흔들릴 여지도
    /// 없다 — 락스텝에서 두 클라이언트가 같은 길을 내야 하므로 이 성질이 속도보다
    /// 중요하다(GDD 7.2).
    /// </para>
    /// </summary>
    public static class Path
    {
        private static readonly int[] Prev = new int[LandMap.NavCols * LandMap.NavRows];
        private static readonly int[] Queue = new int[LandMap.NavCols * LandMap.NavRows];
        private static readonly int[] StampAt = new int[LandMap.NavCols * LandMap.NavRows];
        private static int _stamp;

        /// <summary>이웃을 보는 순서. **고정이어야 한다** — 순서가 다르면 같은 길이 안 나온다.</summary>
        private static readonly int[] DX = { -1, 1, 0, 0 };
        private static readonly int[] DZ = { 0, 0, -1, 1 };

        /// <summary>두 점 사이가 통째로 땅인가. 경유지를 줄일 때 쓴다.</summary>
        private static bool ClearLine(Land land, double ax, double az, double bx, double bz)
        {
            double dx = bx - ax;
            double dz = bz - az;
            double len = Det.Hypot(dx, dz);
            int steps = (int)Math.Ceiling(len / (LandMap.Nav * 0.5));
            if (steps <= 0) return true;
            for (int i = 1; i < steps; i++)
            {
                double t = (double)i / steps;
                if (!land.WalkableCell(
                        LandMap.NavCol(ax + dx * t),
                        LandMap.NavRow(az + dz * t))) return false;
            }
            return true;
        }

        public static List<Vec2> Find(Land land, Vec2 from, Vec2 to)
        {
            var goal = land.WalkableAt(to) ? to : land.NearestWalkable(to);
            var start = land.WalkableAt(from) ? from : land.NearestWalkable(from);

            int sx = LandMap.NavCol(start.X);
            int sz = LandMap.NavRow(start.Z);
            int gx = LandMap.NavCol(goal.X);
            int gz = LandMap.NavRow(goal.Z);
            int si = sz * LandMap.NavCols + sx;
            int gi = gz * LandMap.NavCols + gx;

            if (si == gi) return new List<Vec2> { new Vec2(goal.X, goal.Z) };

            _stamp++;
            int head = 0;
            int tail = 0;
            Queue[tail++] = si;
            StampAt[si] = _stamp;
            Prev[si] = -1;

            bool found = false;
            while (head < tail)
            {
                int cur = Queue[head++];
                if (cur == gi)
                {
                    found = true;
                    break;
                }
                int cx = cur % LandMap.NavCols;
                int cz = (cur - cx) / LandMap.NavCols;
                for (int k = 0; k < 4; k++)
                {
                    int nx = cx + DX[k];
                    int nz = cz + DZ[k];
                    if (nx < 0 || nz < 0 || nx >= LandMap.NavCols || nz >= LandMap.NavRows) continue;
                    int ni = nz * LandMap.NavCols + nx;
                    if (StampAt[ni] == _stamp) continue;
                    if (land.Walk[ni] != 1) continue;
                    StampAt[ni] = _stamp;
                    Prev[ni] = cur;
                    Queue[tail++] = ni;
                }
            }

            // 닿을 수 없는 곳이면 목표 하나만 준다.
            if (!found) return new List<Vec2> { new Vec2(goal.X, goal.Z) };

            var cells = new List<int>();
            for (int cur = gi; cur != -1; cur = Prev[cur]) cells.Add(cur);
            cells.Reverse();

            // 경유지 줄이기 — 지금 자리에서 곧장 보이는 가장 먼 칸까지 건너뛴다.
            var outp = new List<Vec2>();
            double ax = start.X;
            double az = start.Z;
            int i2 = 0;
            while (i2 < cells.Count - 1)
            {
                int best = i2 + 1;
                for (int j = cells.Count - 1; j > i2; j--)
                {
                    int c = cells[j];
                    double px = LandMap.NavX(c % LandMap.NavCols);
                    double pz = LandMap.NavZ((c - (c % LandMap.NavCols)) / LandMap.NavCols);
                    if (ClearLine(land, ax, az, px, pz))
                    {
                        best = j;
                        break;
                    }
                }
                int cb = cells[best];
                ax = LandMap.NavX(cb % LandMap.NavCols);
                az = LandMap.NavZ((cb - (cb % LandMap.NavCols)) / LandMap.NavCols);
                outp.Add(new Vec2(ax, az));
                i2 = best;
            }

            // 마지막은 격자 중심이 아니라 **실제 목표**여야 한다.
            if (outp.Count > 0) outp.RemoveAt(outp.Count - 1);
            outp.Add(new Vec2(goal.X, goal.Z));
            return outp;
        }
    }
}
