using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>중립 세 갈래 (GDD 4.3). 갈래는 셋으로 고정이고 맵마다 옷만 갈아입는다.</summary>
    public enum NeutralKind
    {
        Mercenary = 0,
        Creature = 1,
        Ruin = 2,
    }

    public sealed class NeutralDef
    {
        public NeutralKind Kind;
        public string Name = "";
        public int Guards;
        public double GuardHp;
        public double GuardDps;
        public double GuardRange;
        /// <summary>이겼을 때 얻는 것. 갈래마다 하나씩만 채워진다.</summary>
        public UnitKind[]? RewardUnits;
        public double RewardSilver;
        /// <summary><c>ruin</c>을 점령하면 전초가 서고 시야가 넓어진다.</summary>
        public bool GrantsOutpost;
        public string Blurb = "";
    }

    /// <summary>피오르드 해안이 입는 옷 (GDD 4.3의 맵별 표).</summary>
    public static class FjordNeutrals
    {
        public static readonly NeutralDef Mercenary = new NeutralDef
        {
            Kind = NeutralKind.Mercenary,
            Name = "떠돌이 바랑기아 무리",
            Guards = 3,
            GuardHp = 110,
            GuardDps = 14,
            GuardRange = 3.0,
            RewardUnits = new[] { UnitKind.Axe, UnitKind.Axe, UnitKind.Shield },
            Blurb = "이기면 내 편이 된다",
        };

        public static readonly NeutralDef Creature = new NeutralDef
        {
            Kind = NeutralKind.Creature,
            Name = "곰과 늑대",
            Guards = 2,
            GuardHp = 90,
            GuardDps = 16,
            GuardRange = 2.4,
            RewardSilver = 150,
            Blurb = "잡으면 은을 떨군다",
        };

        public static readonly NeutralDef Ruin = new NeutralDef
        {
            Kind = NeutralKind.Ruin,
            Name = "무너진 돌성채",
            Guards = 1,
            GuardHp = 70,
            GuardDps = 7,
            GuardRange = 2.6,
            GrantsOutpost = true,
            Blurb = "점령하면 멀리 본다",
        };

        public static NeutralDef Of(NeutralKind k) =>
            k == NeutralKind.Mercenary ? Mercenary : k == NeutralKind.Creature ? Creature : Ruin;
    }
}
