using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>유닛 2종 (GDD 6.3). TypeScript <c>data/units.ts</c>의 그대로.</summary>
    public enum UnitKind
    {
        Shield = 0,
        Axe = 1,
        Worker = 2,
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
        /// <summary>
        /// 싸우지 않는 유닛인가. 일꾼만 참이다 — 표적은 되지만 표적을 고르지
        /// 않고, 적이 있는 칸에서는 도망친다. <c>Dps</c>를 0으로 두는 것만으로는
        /// 붙어 서서 맞아 죽는 그림이 된다.
        /// </summary>
        public bool Civilian;
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

        /// <summary>
        /// 일꾼 (GDD 4.6). **자원 노드를 캐지 않는다** — 내 땅 위에 서 있으면 그
        /// 칸의 수입이 오른다. 칸마다 정원이 있어서, 더 벌려면 땅을 더 먹어야 하고
        /// 땅을 먹으려면 앞으로 나가야 한다.
        /// </summary>
        public static readonly UnitDef Worker = new UnitDef
        {
            Kind = UnitKind.Worker,
            Name = "일꾼",
            Cost = 30,
            BuildSeconds = 4,
            Hp = 60,
            Dps = 0,
            Swing = 1,
            DamageTaken = 1.3,
            Speed = 9,
            Range = 0,
            Radius = 0.9,
            Height = 3.0,
            Civilian = true,
        };

        public static UnitDef Of(UnitKind k) =>
            k == UnitKind.Shield ? Shield : k == UnitKind.Axe ? Axe : Worker;

        public static readonly IReadOnlyList<UnitKind> Order =
            new[] { UnitKind.Shield, UnitKind.Axe, UnitKind.Worker };
    }
}
