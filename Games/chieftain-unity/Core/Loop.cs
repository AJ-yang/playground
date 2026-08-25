namespace Chieftain.Core
{
    /// <summary>
    /// 고정 타임스텝.
    ///
    /// <para>
    /// 시뮬레이션은 항상 1/60초 단위로 돌린다. 모니터 주사율이나 프레임 드랍과
    /// 무관하게 같은 전개가 나와야 하기 때문이다. **취향이 아니라 PvP를 위한
    /// 준비다**(GDD 7.2) — 락스텝을 얹으려면 "같은 입력이면 같은 결과"가 성립해야
    /// 하고, 그러려면 dt가 프레임마다 흔들려서는 안 된다.
    /// </para>
    /// <para>
    /// Unity에서는 <c>Time.fixedDeltaTime</c>을 이 값으로 맞추고 <c>FixedUpdate</c>에서
    /// <see cref="Game.Update"/>를 부르면 된다. <c>Time.deltaTime</c>은 렌더 쪽에만 쓴다.
    /// </para>
    /// </summary>
    public static class Loop
    {
        public const double FixedDt = 1.0 / 60.0;

        /// <summary>탭 전환 등으로 프레임이 길게 밀렸을 때 따라잡기 폭주를 막는 상한.</summary>
        public const double MaxFrameTime = 0.25;
    }
}
