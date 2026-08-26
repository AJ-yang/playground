namespace Chieftain.Core
{
    /// <summary>
    /// 손잡이 전부. TypeScript <c>data/tuning.ts</c>의 그대로.
    ///
    /// <para>
    /// **여기가 단일 진실 공급원이다.** 포팅에서 값이 하나라도 어긋나면 대조가
    /// 깨지므로, 원본과 나란히 놓고 읽을 수 있게 순서까지 같게 두었다.
    /// </para>
    /// </summary>
    public static class Tuning
    {
        /// <summary>타일 한 칸의 한 변 길이(월드 단위).</summary>
        public const double TILE = 34;

        /// <summary>지휘 반경 (GDD 3.1). 한 칸보다 크고 두 칸보다 작다.</summary>
        public const double CommandRadius = TILE * 0.62;

        /// <summary>부감 이동 명령 속도. 강림의 유일한 유인이 이 둘의 비율이다.</summary>
        public const double AvatarSpeedCommanded = 7.0;
        public const double AvatarSpeedDriven = 15.4;

        public const double LookSensitivity = 0.0022;

        public const double CaptureSeconds = 6;
        /// <summary>점령이 풀리는 속도는 차오르는 속도보다 느리다.</summary>
        public const double DecaySeconds = 14;

        public const double StartingSilver = 120;
        public const double SilverPerTilePerSecond = 1.15;
        public const double SilverBasePerSecond = 2.2;

        public const int MaxQueue = 5;
        /// <summary>병력 상한. 일꾼은 여기서 뺀다.</summary>
        public const int MaxUnits = 14;

        /// <summary>
        /// 일꾼 상한 (GDD 4.6). 병력 상한과 **따로 센다** — 같은 칸을 두고 다투게
        /// 하면 "일꾼 하나에 병사 하나"라는 뻣뻣한 교환만 남고, 진짜 결정인
        /// "언제 은을 경제로 돌릴 것인가"가 사라진다.
        /// </summary>
        public const int MaxWorkers = 6;

        /// <summary>
        /// 칸 하나가 받을 수 있는 일꾼 수. 이 숫자가 경제를 강림에 묶는 장치다 —
        /// 정원이 차면 더 벌 방법이 땅을 더 먹는 것뿐이다.
        /// </summary>
        public const int WorkersPerTile = 2;

        /// <summary>일꾼 하나가 자기 칸에 더해 주는 초당 은. 회수까지 25초쯤.</summary>
        public const double SilverPerWorker = 1.2;

        public const double KeepHp = 900;

        public const double VisionUnit = TILE * 0.42;
        public const double VisionKeep = TILE * 0.62;
        public const double VisionAvatar = TILE * 0.55;
        public const double VisionOutpost = TILE * 1.15;

        public const double EndBannerDelay = 1.2;
    }

    /// <summary>방패벽 보너스 (GDD 6.2). 지휘 반경 안 유닛이 받는 배수.</summary>
    public static class CommandedBonus
    {
        public const double ShieldDefense = 1.85;
        public const double AxeAttack = 1.6;
        public const double Speed = 1.15;
    }
}
