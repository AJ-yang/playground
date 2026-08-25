using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>
    /// 피오르드 해안 — v1의 유일한 맵 (GDD 6.2). 3×3, 아홉 칸.
    ///
    /// <para>
    /// 칸은 물 위에 떠 있는 섬이고 이웃한 칸 사이는 다리 하나로만 이어진다.
    /// 그래서 아홉 칸짜리 작은 맵에서도 "어느 목을 잡을 것인가"가 생긴다.
    /// </para>
    /// </summary>
    public sealed class TileDef
    {
        public int Id;
        public int Col;
        public int Row;
        /// <summary>월드 좌표. 맵 중앙이 원점이다.</summary>
        public double X;
        public double Z;
    }

    public static class Fjord
    {
        public const int Cols = 3;
        public const int Rows = 3;

        /// <summary>칸의 땅 부분 한 변. TILE보다 작아서 칸 사이에 물이 남는다.</summary>
        public const double TileLand = 28;

        public static int TileId(int col, int row) => row * Cols + col;

        public static readonly int KeepP0 = TileId(0, 1);
        public static readonly int KeepP1 = TileId(2, 1);
        public static readonly int Center = TileId(1, 1);

        public static List<TileDef> MakeTiles()
        {
            var tiles = new List<TileDef>();
            for (int row = 0; row < Rows; row++)
            {
                for (int col = 0; col < Cols; col++)
                {
                    tiles.Add(new TileDef
                    {
                        Id = TileId(col, row),
                        Col = col,
                        Row = row,
                        X = (col - (Cols - 1) / 2.0) * Tuning.TILE,
                        Z = (row - (Rows - 1) / 2.0) * Tuning.TILE,
                    });
                }
            }
            return tiles;
        }

        /// <summary>4방 인접. 대각선은 없다 — 다리가 네 변에만 놓이기 때문이다.</summary>
        public static List<int> NeighborsOf(int col, int row)
        {
            var outp = new List<int>();
            if (col > 0) outp.Add(TileId(col - 1, row));
            if (col < Cols - 1) outp.Add(TileId(col + 1, row));
            if (row > 0) outp.Add(TileId(col, row - 1));
            if (row < Rows - 1) outp.Add(TileId(col, row + 1));
            return outp;
        }

        /// <summary>두 칸을 잇는 다리의 위치 = 두 칸 중심의 중간점.</summary>
        public static Vec2 BridgeBetween(TileDef a, TileDef b) =>
            new Vec2((a.X + b.X) / 2, (a.Z + b.Z) / 2);

        /// <summary>180° 회전 대칭의 짝 (GDD 4.2).</summary>
        public static int MirrorOf(int id)
        {
            int col = id % Cols;
            int row = id / Cols;
            return TileId(Cols - 1 - col, Rows - 1 - row);
        }

        /// <summary>
        /// 중립 배치. **반쪽만 뽑고 회전 복사한다** (GDD 4.2).
        ///
        /// <para>
        /// 뽑는 칸이 셋이고 갈래도 셋이라 "무엇이 나오느냐"가 아니라 "어디에
        /// 나오느냐"만 무작위다. 한 판에 세 갈래가 모두 등장해야 GDD 4.3이 말한
        /// 세 종류의 결정이 실제로 한 판 안에서 부딪힌다.
        /// </para>
        /// </summary>
        public static Dictionary<int, NeutralKind> PlaceNeutrals(uint seed)
        {
            var rng = new Rng(seed);

            // 왼쪽 절반에서 본진을 뺀 칸들. 오른쪽은 이들의 거울상이고, 중앙은 비운다.
            int[] half = { TileId(0, 0), TileId(0, 2), TileId(1, 0) };

            var kinds = new[] { NeutralKind.Mercenary, NeutralKind.Creature, NeutralKind.Ruin };
            // Fisher–Yates. Rng를 쓰므로 같은 시드면 같은 배치가 나온다.
            for (int i = kinds.Length - 1; i > 0; i--)
            {
                int j = rng.Int(0, i);
                (kinds[i], kinds[j]) = (kinds[j], kinds[i]);
            }

            var outp = new Dictionary<int, NeutralKind>();
            for (int i = 0; i < half.Length; i++)
            {
                var kind = kinds[i];
                outp[half[i]] = kind;
                outp[MirrorOf(half[i])] = kind;
            }
            return outp;
        }
    }
}
