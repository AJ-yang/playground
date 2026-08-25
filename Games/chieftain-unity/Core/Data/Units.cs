using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>유닛 2종 (GDD 6.3). TypeScript <c>data/units.ts</c>의 그대로.</summary>
    public enum UnitKind
    {
        Shield = 0,
        Axe = 1,
    }

    public sealed class UnitDef
    {
        public UnitKind Kind;
        public string Name = "";
        public int Cost;
        /// <summary>생산에 걸리는 초.</summary>
        public double BuildSeconds;
        public double Hp;
        /// <summary>초당 피해량. 실제 타격은 <see cref="Swing"/>마다 뭉쳐서 들어간다.</summary>
        public double Dps;
        /// <summary>한 번 휘두르는 간격(초). 한 대에 <c>Dps * Swing</c>이 들어간다.</summary>
        public double Swing;
        /// <summary>받는 피해에 곱해지는 값. 낮을수록 단단하다.</summary>
        public double DamageTaken;
        /// <summary>월드 단위 / 초.</summary>
        public double Speed;
        /// <summary>사거리. 둘 다 근접이지만 방패병이 조금 더 길다(창·방패 대형).</summary>
        public double Range;
        /// <summary>몸 크기. 겹침 밀어내기와 사거리 계산에 쓴다.</summary>
        public double Radius;
        public double Height;
    }

    public static class Units
    {
        public static readonly UnitDef Shield = new UnitDef
        {
            Kind = UnitKind.Shield,
            Name = "방패병",
            Cost = 45,
            BuildSeconds = 5,
            Hp = 130,
            Dps = 9,
            Swing = 1.15,
            DamageTaken = 1,
            Speed = 7.5,
            Range = 3.2,
            Radius = 1.15,
            Height = 3.4,
        };

        public static readonly UnitDef Axe = new UnitDef
        {
            Kind = UnitKind.Axe,
            Name = "도끼병",
            Cost = 55,
            BuildSeconds = 6,
            Hp = 85,
            Dps = 17,
            Swing = 0.7,
            DamageTaken = 1.25,
            Speed = 10.5,
            Range = 2.6,
            Radius = 1.0,
            Height = 3.2,
        };

        public static UnitDef Of(UnitKind k) => k == UnitKind.Shield ? Shield : Axe;

        public static readonly IReadOnlyList<UnitKind> Order = new[] { UnitKind.Shield, UnitKind.Axe };
    }
}
