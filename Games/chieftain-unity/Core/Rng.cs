namespace Chieftain.Core
{
    /// <summary>
    /// 시드 기반 난수 (mulberry32). TypeScript <c>core/rng.ts</c>의 그대로.
    ///
    /// <para>
    /// **여기가 결정론의 바닥이다.** 락스텝은 두 클라이언트가 같은 입력에서 같은
    /// 상태를 내야 성립하는데, 난수 한 비트가 어긋나면 그 순간 갈라진다. 그래서
    /// JS의 <c>Math.imul</c>·<c>&gt;&gt;&gt; 0</c>을 흉내내는 것이 아니라 **같은
    /// 정수 연산으로 다시 쓴다** — 둘 다 32비트 부호 없는 정수 산술이라 결과가
    /// 정의상 일치한다.
    /// </para>
    /// </summary>
    public sealed class Rng
    {
        private uint _state;

        public Rng(uint seed = 0x9e3779b9u)
        {
            _state = seed;
        }

        /// <summary>[0, 1)</summary>
        public double Next()
        {
            unchecked
            {
                _state = _state + 0x6d2b79f5u;
                uint t = _state;
                // Math.imul(a, b) === 32비트로 잘라낸 곱. C#의 uint 곱이 같은 일을 한다.
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>[min, max)</summary>
        public double Range(double min, double max) => min + Next() * (max - min);

        /// <summary>[min, max] 정수</summary>
        public int Int(int min, int max) => (int)System.Math.Floor(Range(min, max + 1));
    }
}
