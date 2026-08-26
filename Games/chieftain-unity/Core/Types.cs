using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>0·1은 플레이어, 2는 중립 수비대. 중립도 유닛으로 다루면 전투 코드가 하나로 끝난다.</summary>
    public static class Faction
    {
        public const int Neutral = 2;
        /// <summary>소유주 없음.</summary>
        public const int Nobody = -1;
    }

    public sealed class Unit
    {
        public int Id;
        /// <summary>0·1은 플레이어, <see cref="Faction.Neutral"/>은 중립.</summary>
        public int Fac;
        public UnitKind Kind;
        public Vec2 Pos;
        public double Hp;
        public double MaxHp;
        /// <summary>지금 서 있는 칸. 매 틱 갱신된다.</summary>
        public int Tile;
        /// <summary>남은 이동 경유지. 다리를 지나야 하므로 직선이 아니다.</summary>
        public List<Vec2> Path = new List<Vec2>();
        /// <summary>경유지의 최종 목적지 칸. -1이면 목적지 없음.</summary>
        public int DestTile = -1;
        /// <summary>이번 틱에 지휘 반경 안에 있었는가 (GDD 3.1).</summary>
        public bool Commanded;
        /// <summary>반경 밖 유닛이 스스로 판단을 다시 하기까지 남은 시간.</summary>
        public double ThinkIn;
        /// <summary>중립 수비대는 자기 칸을 떠나지 않는다.</summary>
        public int AnchorTile = -1;
        public double Facing;

        // ── 전투. 아래 넷은 전부 "지금 무슨 일이 일어나는지"를 보이게 하는 값이다.

        /// <summary>다음 타격까지 남은 시간. 끊어 쳐야 전투에 리듬이 생긴다.</summary>
        public double SwingIn;
        /// <summary>내지르는 연출. 1에서 0으로 줄며 몸이 앞으로 나갔다 돌아온다.</summary>
        public double Lunge;
        /// <summary>맞은 직후. 1에서 0으로 줄며 몸이 하얗게 번쩍인다.</summary>
        public double Flash;
        /// <summary>방패벽이 실제로 막아낸 순간. 반경 안 방패병만 켜진다.</summary>
        public double Guard;
        /// <summary>이번 틱에 사거리 안의 무언가를 치고 있었는가.</summary>
        public bool Fighting;
        /// <summary>집중 공격 대상. 반경 안 유닛만 따른다. -1이면 알아서 고른다.</summary>
        public int FocusId = -1;
    }

    /// <summary>타격 자국. 판정에 관여하지 않는 순수한 흔적이다.</summary>
    public sealed class Hit
    {
        public Vec2 Pos;
        /// <summary>남은 수명 0~1.</summary>
        public double Life;
        public bool Big;
        public bool Guarded;
    }

    public sealed class Corpse
    {
        public Vec2 Pos;
        public double Facing;
        public UnitKind Kind;
        public int Fac;
        public double Life;
    }

    /// <summary>건물 (전진 기지). 본진은 <see cref="PlayerState.KeepHp"/>가 따로 들고 있다.</summary>
    public sealed class Building
    {
        public int Id;
        public int Side;
        public int Tile;
        public Vec2 Pos;
        public double Hp;
        public double MaxHp;
        /// <summary>다 지어질 때까지 남은 초. 0이면 완성.</summary>
        public double Raising;
    }

    public sealed class Avatar
    {
        public int Side;
        public Vec2 Pos;
        /// <summary>1인칭 시선. 부감에서도 몸이 이쪽을 본다.</summary>
        public double Yaw;
        /// <summary>부감에서 내린 이동 명령의 목적지. 직접 몰 때는 null.</summary>
        public Vec2? MoveTarget;
        /// <summary>
        /// 그 목적지까지의 경유지.
        ///
        /// <para>
        /// 예전에는 매 틱 경로를 다시 냈다. 아홉 칸짜리 판에서는 공짜였지만, 지금은
        /// 통행 격자 8,640칸을 훑는 탐색이라 매 틱 돌릴 수가 없다. 명령을 받을 때
        /// 한 번 내고 경유지를 하나씩 지운다.
        /// </para>
        /// </summary>
        public List<Vec2> Path = new List<Vec2>();
        /// <summary>이 아바타를 지금 1인칭으로 몰고 있는가 (GDD 3.2).</summary>
        public bool Driving;
    }

    public sealed class NeutralCamp
    {
        public int Tile;
        public NeutralKind Kind;
        /// <summary>살아 있는 수비대의 유닛 id. 비면 캠프가 뚫린 것이다.</summary>
        public List<int> Guards = new List<int>();
        public bool Cleared;
        /// <summary>마지막으로 피해를 입힌 진영. 보상은 여기로 간다.</summary>
        public int LastDamager = Faction.Nobody;
    }

    public sealed class Tile
    {
        public RegionDef Def = null!;
        /// <summary>점유도. +1이면 완전히 0번, -1이면 완전히 1번의 땅이다.</summary>
        public double Hold;
        public int Owner = Faction.Nobody;
        public NeutralCamp? Neutral;
        /// <summary>무너진 돌성채를 점령해 세운 전초. 시야가 넓어진다.</summary>
        public bool Outpost;
        /// <summary>한 번이라도 본 적 있는가 (진영별).</summary>
        public bool[] Seen = new bool[2];
    }

    public sealed class QueueItem
    {
        public UnitKind Kind;
        public double Remain;
    }

    public sealed class PlayerState
    {
        public int Side;
        public double Silver;
        public List<QueueItem> Queue = new List<QueueItem>();
        /// <summary>부대에게 준 집결 지점. 반경 안 유닛은 정확히, 밖 유닛은 대충 따른다.</summary>
        public Vec2 Rally;
        public int RallyTile;
        public Avatar Avatar = null!;
        public double KeepHp;
        public int KeepTile;
        /// <summary>집중 공격 대상. 반경 안 부대가 이놈부터 친다.</summary>
        public int FocusId = -1;
    }

    public enum Phase
    {
        Playing = 0,
        Over = 1,
    }

    public sealed class EndState
    {
        public int Winner;
        public string Reason = "keep";
    }

    /// <summary>관찰 지표 (GDD 6.5). 합격 판정이 곧 이 숫자들이다.</summary>
    public sealed class Telemetry
    {
        /// <summary>강림 횟수. 0이면 첫 번째 불합격.</summary>
        public int Descents;
        /// <summary>1인칭으로 보낸 총 시간.</summary>
        public double TimeInFirstPerson;
        public double LastDescentAt = -1;
        public double Elapsed;
    }

    public sealed class LogEntry
    {
        public string Text = "";
        public double At;
    }
}
