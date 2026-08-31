using System;

namespace Chieftain.Core
{
    /// <summary>
    /// 평면 벡터. 게임 로직은 전부 2D(xz 평면)에서 돈다.
    ///
    /// <para>
    /// <c>struct</c>로 둔 이유는 TypeScript 쪽이 값처럼 다루기 때문이다 —
    /// <c>u.pos = moveToward(...)</c>처럼 늘 새 객체를 만들어 대입한다. 참조 타입으로
    /// 옮기면 어딘가에서 공유 참조가 생겨 원본에 없던 별칭 버그가 난다.
    /// </para>
    /// </summary>
    public readonly struct Vec2 : IEquatable<Vec2>
    {
        public readonly double X;
        public readonly double Z;

        public Vec2(double x, double z)
        {
            X = x;
            Z = z;
        }

        public bool Equals(Vec2 o) => X.Equals(o.X) && Z.Equals(o.Z);
        public override bool Equals(object? o) => o is Vec2 v && Equals(v);
        public override int GetHashCode() => X.GetHashCode() * 397 ^ Z.GetHashCode();
        public override string ToString() => $"({X}, {Z})";
    }

    /// <summary>
    /// 결정론적 산술. <c>Games/chieftain/src/core/det.ts</c>와 **연산 순서까지 같은 짝**이다.
    ///
    /// <para>
    /// IEEE 754는 사칙연산과 <c>sqrt</c>만 마지막 비트까지 결과를 못 박고,
    /// <c>sin</c>·<c>cos</c>·<c>atan2</c>·<c>hypot</c>은 구현에 맡긴다. 같은 입력
    /// 20,000개를 V8과 .NET에 먹여 실제로 재보면 이렇다:
    /// </para>
    /// <list type="table">
    /// <item><term>Math.hypot 대 sqrt(x²+z²)</term><description>37.0% 불일치</description></item>
    /// <item><term>sqrt 대 sqrt</term><description>0.0%</description></item>
    /// <item><term>atan2</term><description>17.9% 불일치</description></item>
    /// <item><term>sin</term><description>3.4% 불일치</description></item>
    /// <item><term>cos</term><description>3.1% 불일치</description></item>
    /// </list>
    /// <para>
    /// 락스텝은 두 클라이언트가 같은 비트를 내야 성립한다(GDD 7.2). 1비트 차이는
    /// 다음 틱에 2비트가 되고 30초 뒤에는 다른 판이 된다. 그래서 <c>hypot</c>은
    /// <c>sqrt</c>로 못 박고, 나머지 셋은 **Cephes 알고리즘을 손으로 옮겨 적었다** —
    /// 곱셈·덧셈·나눗셈·비교만 쓰므로 어느 런타임에서도 답이 같다.
    /// </para>
    /// <para>
    /// 네이티브 <c>System.Math</c>와의 최대 오차는 sin·cos가 1.1e-16, atan2가
    /// 8.9e-16이다 — 1 ULP 남짓이라 게임 동작은 그대로다.
    /// </para>
    /// </summary>
    public static class Det
    {
        /// <summary>넘침 보정 없는 빗변. <c>sqrt</c>는 IEEE가 결과를 못 박는다.</summary>
        public static double Hypot(double x, double z) => Math.Sqrt(x * x + z * z);

        // ───────────────────────────────────────────── atan (Cephes)

        private const double MoreBits = 6.123233995736765886130e-17;
        /// <summary>tan(3π/8)</summary>
        private const double Tan3Pi8 = 2.41421356237309504880;
        /// <summary>tan(π/8)</summary>
        private const double TanPi8 = 0.41421356237309504880;

        private static readonly double[] AtanP =
        {
            -8.750608600031904122785e-1,
            -1.615753718733365076637e1,
            -7.500855792314704667340e1,
            -1.228866684490136173410e2,
            -6.485021904942025371773e1,
        };

        private static readonly double[] AtanQ =
        {
            2.485846490142306297962e1,
            1.650270098316988542046e2,
            4.328810604912902668951e2,
            4.853903996359136964868e2,
            1.945506571482613964425e2,
        };

        /// <summary>[0, ∞)에 대한 atan. 인수 축소 뒤 유리 근사 하나로 끝난다.</summary>
        private static double AtanPositive(double x0)
        {
            double x = x0;
            double y;

            // 범위를 [0, tan(π/8)]로 줄인다. 셋으로 나누면 그 안에서 근사가 배정밀도에 닿는다.
            if (x > Tan3Pi8)
            {
                y = Math.PI / 2;
                x = -1 / x;
            }
            else if (x > TanPi8)
            {
                y = Math.PI / 4;
                x = (x - 1) / (x + 1);
            }
            else
            {
                y = 0;
            }

            double z = x * x;

            double p = AtanP[0];
            for (int i = 1; i < 5; i++) p = p * z + AtanP[i];
            double q = z + AtanQ[0];
            for (int i = 1; i < 5; i++) q = q * z + AtanQ[i];

            double r = x + x * z * (p / q);

            // 축소하며 잘라낸 자리를 되돌린다. 이걸 빼면 π/2 근처에서 정밀도가 떨어진다.
            if (y == Math.PI / 2) return y + (MoreBits + r);
            if (y == Math.PI / 4) return y + (0.5 * MoreBits + r);
            return r;
        }

        public static double Atan(double x) => x < 0 ? -AtanPositive(-x) : AtanPositive(x);

        /// <summary>
        /// atan2. 이 게임은 <c>Atan2(dx, dz)</c>로 부른다 — z가 앞이라 인수 순서가
        /// 뒤집혀 있다. 여기서는 수학 관례대로 (y, x)를 받고 부르는 쪽이 맞춘다.
        /// </summary>
        public static double Atan2(double y, double x)
        {
            if (x == 0)
            {
                if (y == 0) return 0;
                return y > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            if (y == 0) return x > 0 ? 0 : Math.PI;

            double a = AtanPositive(Math.Abs(y / x));
            if (x < 0) a = Math.PI - a;
            return y < 0 ? -a : a;
        }

        // ───────────────────────────────────────── sin·cos (Cephes)

        /// <summary>π/4를 셋으로 쪼갠 값. 나눠 빼야 큰 각에서도 자릿수를 잃지 않는다.</summary>
        private const double DP1 = 7.85398125648498535156e-1;
        private const double DP2 = 3.77489470793079817668e-8;
        private const double DP3 = 2.69515142907905952645e-15;

        private static readonly double[] SinCof =
        {
            1.58962301576546568060e-10,
            -2.50507477628578072866e-8,
            2.75573136213857245213e-6,
            -1.98412698295895385996e-4,
            8.33333333332211858878e-3,
            -1.66666666666666307295e-1,
        };

        private static readonly double[] CosCof =
        {
            -1.13585365213876817300e-11,
            2.08757008419747316778e-9,
            -2.75573141792967388112e-7,
            2.48015872888517179954e-5,
            -1.38888888888730564116e-3,
            4.16666666666665929218e-2,
        };

        private static double PolySin(double zz)
        {
            double p = SinCof[0];
            for (int i = 1; i < 6; i++) p = p * zz + SinCof[i];
            return p;
        }

        private static double PolyCos(double zz)
        {
            double p = CosCof[0];
            for (int i = 1; i < 6; i++) p = p * zz + CosCof[i];
            return p;
        }

        /// <summary>
        /// 팔분원으로 줄인 뒤 다항식 하나로 끝낸다. 두 함수가 축소 단계를 통째로
        /// 공유하기 때문에 하나로 묶어 두는 편이 어긋날 여지가 적다.
        /// </summary>
        private static double SinCos(double xIn, bool wantCos)
        {
            double x = xIn;
            int sign = 1;

            if (wantCos)
            {
                x = Math.Abs(x);
            }
            else if (x < 0)
            {
                x = -x;
                sign = -1;
            }

            // 이 게임의 각은 ±수백 라디안을 넘지 않는다. 그래도 방어는 해 둔다.
            if (!(x < 1.073741824e9)) return 0;

            double y = Math.Floor(x / (Math.PI / 4));
            // y를 16으로 나눈 나머지. 2의 거듭제곱이라 곱·나눗셈이 정확하다.
            double z = Math.Floor(y / 16);
            z = y - z * 16;
            int j = (int)z;

            if ((j & 1) != 0)
            {
                j += 1;
                y += 1;
            }
            j = j & 7;

            if (j > 3)
            {
                sign = -sign;
                j -= 4;
            }
            if (wantCos && j > 1) sign = -sign;

            // 자릿수를 잃지 않고 x mod π/4를 구한다.
            double w = ((x - y * DP1) - y * DP2) - y * DP3;
            double zz = w * w;

            // **sin과 cos는 팔분원 번호에 따라 서로의 다항식을 쓴다.** 여기가 뒤집히기
            // 쉬운 자리다 — sin은 j가 1·2일 때 cos 다항식을, cos는 그때 sin 다항식을 쓴다.
            bool inMiddle = j == 1 || j == 2;
            bool useCosPoly = inMiddle != wantCos;
            double r;
            if (useCosPoly)
            {
                r = 1.0 - 0.5 * zz + zz * zz * PolyCos(zz);
            }
            else
            {
                r = w + w * w * w * PolySin(zz);
            }

            return sign < 0 ? -r : r;
        }

        public static double Sin(double a) => SinCos(a, false);
        public static double Cos(double a) => SinCos(a, true);

        // ───────────────────────────────────────────────────── 벡터

        public static double Len(Vec2 a) => Hypot(a.X, a.Z);

        public static double Dist(Vec2 a, Vec2 b) => Hypot(a.X - b.X, a.Z - b.Z);

        /// <summary>제곱 거리. 비교만 할 때는 이쪽이 싸다.</summary>
        public static double Dist2(Vec2 a, Vec2 b)
        {
            double dx = a.X - b.X;
            double dz = a.Z - b.Z;
            return dx * dx + dz * dz;
        }

        public static Vec2 Norm(Vec2 a)
        {
            double l = Hypot(a.X, a.Z);
            return l < 1e-6 ? new Vec2(0, 0) : new Vec2(a.X / l, a.Z / l);
        }

        /// <summary>a에서 b를 향해 최대 maxStep만큼 이동한 지점.</summary>
        public static Vec2 MoveToward(Vec2 a, Vec2 b, double maxStep)
        {
            double dx = b.X - a.X;
            double dz = b.Z - a.Z;
            double l = Hypot(dx, dz);
            if (l <= maxStep || l < 1e-6) return new Vec2(b.X, b.Z);
            double k = maxStep / l;
            return new Vec2(a.X + dx * k, a.Z + dz * k);
        }

        public static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

        /// <summary>JS <c>Math.sign</c>. 0과 -0은 그대로 0을 돌려준다.</summary>
        public static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : 0;
    }
}
