using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>전진 기지 (GDD 4.3 확장).</summary>
    public static class Forge
    {
        public const double Cost = 90;
        public const double RaiseSeconds = 8;
        /// <summary>
        /// 체력. 처음엔 340이었는데 돌려보니 13초 만에 무너졌다 — 은 90과 8초를
        /// 들인 것이 그렇게 죽으면 아무도 안 짓는다. 지금은 셋이 붙어 20초쯤 걸린다.
        /// </summary>
        public const double Hp = 850;
        public const double SilverPerSecond = 1.3;
        /// <summary>
        /// 세우면 그 둘레가 보인다.
        ///
        /// <para>
        /// 예전에는 34 * 0.9였다. 34는 사라진 옛 칸 크기였고, 지역이 60으로
        /// 커진 뒤로는 자기가 선 지역조차 다 안 보이는 눈이 됐다.
        /// </para>
        /// </summary>
        public const double Vision = Tuning.TILE * 0.9;
    }

    /// <summary>
    /// 판 전체.
    ///
    /// <para>
    /// **렌더링을 전혀 모른다.** <see cref="Update"/>만 부르면 판이 굴러가고, 그림은
    /// 바깥에서 이 상태를 읽어 그린다. Unity로 옮길 때 이 클래스가 그대로 가는 이유가
    /// 그것이다 — <c>Assets/Scripts/Core</c>에 넣고 <c>MonoBehaviour</c>는 이 상태를
    /// 읽기만 한다. 락스텝을 얹으면 두 클라이언트에서 이 클래스만 똑같이 돌면 된다
    /// (GDD 7.2).
    /// </para>
    /// </summary>
    public sealed class Game
    {
        /// <summary>반경 밖 유닛이 스스로 판단을 다시 하는 주기.</summary>
        private const double AutonomyThink = 1.5;

        /// <summary>유닛이 스스로 달려드는 거리. 이보다 멀면 못 본 척한다.</summary>
        private const double Aggro = 9;

        /// <summary>
        /// 유닛이 서로 지키는 간격. 판정 반지름이 아니라 **눈에 보이는 몸 크기**를
        /// 기준으로 민다 — 대열의 모양은 장식이 아니라 지휘 반경을 읽는 단서다.
        /// </summary>
        private const double BodySpacing = 1.75;

        private const double HitFade = 0.28;
        private const double CorpseFade = 2.4;
        private const double LungeFade = 0.22;
        private const double FlashFade = 0.2;

        /// <summary>집중 공격이 통하는 거리. 이보다 멀면 지목해도 못 알아듣는다.</summary>
        private const double FocusRange = 16;

        /// <summary>경유지에 이만큼 가까우면 도착한 것으로 치고 다음 경유지를 본다.</summary>
        private const double WaypointEps = 0.8;

        /// <summary>일꾼이 갈 곳을 다시 고르는 주기. 병사보다 자주 본다 — 도망쳐야 하기 때문이다.</summary>
        private const double WorkerThink = 0.8;

        public readonly Board Board;
        public readonly Rng Rng;
        public readonly List<Unit> Units = new List<Unit>();
        public readonly PlayerState[] Players;
        public readonly int HumanSide;

        public Phase Phase = Phase.Playing;
        public EndState? End;
        public double EndTimer;

        /// <summary>진영별로 지금 보이는 칸. 렌더러와 AI가 함께 읽는다.</summary>
        public HashSet<int>[] Visible = { new HashSet<int>(), new HashSet<int>() };

        public Telemetry Telemetry = new Telemetry();

        /// <summary>플레이어가 세운 전진 기지. 본진은 여기 없다.</summary>
        public readonly List<Building> Buildings = new List<Building>();

        /// <summary>판정에 관여하지 않는 흔적들 — 타격 자국과 시신.</summary>
        public readonly List<Hit> Hits = new List<Hit>();
        public readonly List<Corpse> Corpses = new List<Corpse>();

        /// <summary>UI에 띄울 짧은 알림. 오래된 것부터 사라진다.</summary>
        public readonly List<LogEntry> Log = new List<LogEntry>();

        private int _nextId = 1;

        public Game(uint seed, int humanSide)
        {
            Rng = new Rng(seed);
            HumanSide = humanSide;
            Board = new Board(seed, LandMap.KeepP0, LandMap.KeepP1);

            Players = new[] { MakePlayer(0, LandMap.KeepP0), MakePlayer(1, LandMap.KeepP1) };
            SpawnNeutralGuards();

            // 시작 병력. 아무것도 없이 시작하면 첫 30초가 빈 화면이 된다.
            for (int side = 0; side < 2; side++)
            {
                SpawnUnit(side, UnitKind.Shield, Players[side].KeepTile);
                SpawnUnit(side, UnitKind.Axe, Players[side].KeepTile);
            }
            RefreshVisibility();
        }

        // ───────────────────────────────────────────────────────── 만들기

        private PlayerState MakePlayer(int side, int keepTile)
        {
            // 지역 **중심**이 아니라 대표점을 쓴다. 중심은 물일 수 있다(Board.Anchor).
            var home = Board.Anchor(keepTile);
            return new PlayerState
            {
                Side = side,
                Silver = Tuning.StartingSilver,
                Queue = new List<QueueItem>(),
                Rally = new Vec2(home.X, home.Z),
                RallyTile = keepTile,
                KeepHp = Tuning.KeepHp,
                KeepTile = keepTile,
                FocusId = -1,
                Avatar = new Avatar
                {
                    Side = side,
                    // 판이 시작될 때 신은 판 위에 없다. 이 자리는 아직 쓰이지 않는
                    // 기본값이고, 첫 강림 때 사람이 찍는 곳으로 덮인다.
                    Pos = Board.ClampToLand(new Vec2(home.X + (side == 0 ? 10 : -10), home.Z + 6)),
                    Yaw = side == 0 ? 0 : Math.PI,
                    Embodied = false,
                    DescendIn = 0,
                },
            };
        }

        private void SpawnNeutralGuards()
        {
            foreach (var tile in Board.Tiles)
            {
                var camp = tile.Neutral;
                if (camp == null) continue;
                var def = FjordNeutrals.Of(camp.Kind);
                for (int i = 0; i < def.Guards; i++)
                {
                    var u = MakeGuard(def, tile.Def.Id, i);
                    Units.Add(u);
                    camp.Guards.Add(u.Id);
                }
            }
        }

        private Unit MakeGuard(NeutralDef def, int tileId, int index)
        {
            var d = Board.Anchor(tileId);
            double a = ((double)index / Math.Max(1, def.Guards)) * Math.PI * 2;
            return new Unit
            {
                Id = _nextId++,
                Fac = Faction.Neutral,
                // 중립도 유닛 틀을 그대로 쓴다. 생김새만 다르고 규칙은 같다.
                Kind = UnitKind.Axe,
                Pos = Board.ClampToLand(new Vec2(d.X + Det.Cos(a) * 9, d.Z + Det.Sin(a) * 9)),
                Hp = def.GuardHp,
                MaxHp = def.GuardHp,
                Tile = tileId,
                Path = new List<Vec2>(),
                DestTile = -1,
                Commanded = false,
                Ordered = false,
                ThinkIn = 0,
                AnchorTile = tileId,
                Facing = a,
                SwingIn = 0,
                Lunge = 0,
                Flash = 0,
                Guard = 0,
                Fighting = false,
                FocusId = -1,
            };
        }

        public Unit SpawnUnit(int side, UnitKind kind, int tileId)
        {
            var d = Board.Anchor(tileId);
            double a = Rng.Range(0, Math.PI * 2);
            double r = Rng.Range(3, 13);
            var u = new Unit
            {
                Id = _nextId++,
                Fac = side,
                Kind = kind,
                Pos = Board.ClampToLand(new Vec2(d.X + Det.Cos(a) * r, d.Z + Det.Sin(a) * r)),
                Hp = Units_Def(kind).Hp,
                MaxHp = Units_Def(kind).Hp,
                Tile = tileId,
                Path = new List<Vec2>(),
                DestTile = -1,
                Commanded = false,
                Ordered = false,
                ThinkIn = 0,
                AnchorTile = -1,
                Facing = side == 0 ? 0 : Math.PI,
                SwingIn = 0,
                Lunge = 0,
                Flash = 0,
                Guard = 0,
                Fighting = false,
                FocusId = -1,
            };
            Units.Add(u);
            return u;
        }

        private static UnitDef Units_Def(UnitKind k) => Chieftain.Core.Units.Of(k);

        // ───────────────────────────────────────────────────────── 명령

        /// <summary>
        /// 부대 집결 지점.
        ///
        /// <para>
        /// 모두가 정확히 듣는다. 신이 부감에서 사라진 지금 "반경 밖은 대충
        /// 듣는다"를 그대로 두면 아무도 명령을 안 듣는 게임이 된다. 지휘
        /// 반경은 이제 명령을 듣느냐가 아니라 얼마나 세느냐를 가른다(GDD 3.1).
        /// </para>
        /// </summary>
        public void SetRally(int side, Vec2 point)
        {
            var p = Players[side];
            p.FocusId = EnemyNear(side, point, 5.5);
            int tile = Board.TileAt(point);
            p.RallyTile = tile;
            p.Rally = Board.ClampToLand(point);
            foreach (var u in Units)
            {
                if (u.Fac != side) continue;
                // 일꾼은 집결 명령을 안 듣는다. 부대와 같이 전선으로 걸어가면
                // 그냥 죽으러 가는 것이고, 그러면 아무도 일꾼을 안 뽑는다.
                if (Units_Def(u.Kind).Civilian) continue;
                // **집결 지점이 명령을 푼다.** 우클릭으로 세워 둔 부대를 다시
                // 자율 판단으로 돌려보낼 유일한 길이다.
                u.Ordered = false;
                u.ThinkIn = 0;
                Repath(u, tile, p.Rally);
            }
        }

        /// <summary>
        /// 고른 부대에게 내리는 이동·공격 명령 (우클릭).
        ///
        /// <para>
        /// 선택은 시뮬레이션 밖에 있다. 여기 들어오는 것은 이미 확정된 id
        /// 목록뿐이라, 락스텝에서 두 클라이언트가 서로 다른 것을 골라 놓고도
        /// 같은 판을 굴릴 수 있다(GDD 7.2).
        /// </para>
        /// </summary>
        public void CommandUnits(int side, IReadOnlyList<int> ids, Vec2 point)
        {
            var p = Players[side];
            var target = Board.ClampToLand(point);
            int tile = Board.TileAt(target);

            int foe = EnemyNear(side, target, 6.5);
            if (foe >= 0) p.FocusId = foe;

            var mine = new List<Unit>();
            foreach (int id in ids)
            {
                foreach (var u in Units)
                {
                    if (u.Id == id && u.Fac == side && u.Hp > 0) { mine.Add(u); break; }
                }
            }
            if (mine.Count == 0) return;

            for (int i = 0; i < mine.Count; i++)
            {
                var u = mine[i];
                var spot = mine.Count == 1 ? target : Spread(target, i);
                u.Ordered = true;
                u.ThinkIn = 0;
                u.FocusId = foe;
                Repath(u, tile, spot);
            }
        }

        /// <summary>여럿을 한 점에 보낼 때 벌려 세우는 자리. Det만 쓴다.</summary>
        private Vec2 Spread(Vec2 center, int index)
        {
            int ring = index / 6;
            int slot = index % 6;
            double r = 3.2 + ring * 3.2;
            double a = ((double)slot / 6) * Math.PI * 2 + ring * 0.5;
            return Board.ClampToLand(new Vec2(center.X + Det.Cos(a) * r, center.Z + Det.Sin(a) * r));
        }

        /// <summary>
        /// 여기에 내려갈 수 있는가. 지금 보이는 땅에만 내려간다 — 안개 속에
        /// 찍을 수 있으면 강림이 공짜 정찰이 된다(GDD 3.3).
        /// </summary>
        public bool CanDescend(int side, Vec2 point)
        {
            var a = Players[side].Avatar;
            if (a.Embodied || a.DescendIn > 0) return false;
            if (!Board.IsWalkable(point)) return false;
            return Visible[side].Contains(Board.TileAt(point));
        }

        /// <summary>
        /// 강림 (GDD 3.2). 그 자리에 몸이 생기고 그 자리에 지휘 반경이 켜진다.
        /// </summary>
        public bool Descend(int side, Vec2 point)
        {
            if (!CanDescend(side, point)) return false;
            var a = Players[side].Avatar;
            a.Pos = Board.ClampToLand(point);
            a.Embodied = true;
            a.DescendIn = 0;
            if (side == HumanSide)
            {
                Telemetry.Descents++;
                Telemetry.LastDescentAt = Telemetry.Elapsed;
            }
            Note("강림한다", side);
            return true;
        }

        /// <summary>승천. 몸이 사라지고 반경도 같이 꺼진다.</summary>
        public void Ascend(int side)
        {
            var a = Players[side].Avatar;
            if (!a.Embodied) return;
            a.Embodied = false;
            a.DescendIn = Tuning.DescendCooldown;
        }

        /// <summary>1인칭에서 직접 모는 한 스텝. dir는 정규화된 진행 방향.</summary>
        public void DriveAvatar(int side, Vec2 dir, double dt)
        {
            var a = Players[side].Avatar;
            if (!a.Embodied) return;
            double step = Tuning.AvatarSpeedDriven * dt;
            var next = new Vec2(a.Pos.X + dir.X * step, a.Pos.Z + dir.Z * step);
            // 물에는 못 들어간다. 축을 하나씩 시험해 벽을 따라 미끄러지게 한다.
            if (Board.IsWalkable(next))
            {
                a.Pos = next;
                return;
            }
            var slideX = new Vec2(next.X, a.Pos.Z);
            if (Board.IsWalkable(slideX))
            {
                a.Pos = slideX;
                return;
            }
            var slideZ = new Vec2(a.Pos.X, next.Z);
            if (Board.IsWalkable(slideZ)) a.Pos = slideZ;
        }

        /// <summary>그 지점 근처에 서 있는, 내가 볼 수 있는 적 유닛. 없으면 -1.</summary>
        public int EnemyNear(int side, Vec2 point, double radius)
        {
            int best = -1;
            double bestD = radius;
            foreach (var u in Units)
            {
                if (u.Hp <= 0 || u.Fac == side) continue;
                if (!Visible[side].Contains(u.Tile)) continue;
                double d = Det.Dist(u.Pos, point);
                if (d < bestD)
                {
                    bestD = d;
                    best = u.Id;
                }
            }
            return best;
        }

        /// <summary>
        /// 전진 기지를 세운다 (아바타가 선 자리에).
        ///
        /// <para>
        /// **아바타가 그 칸에 있어야 한다.** 이것이 이 기능을 그냥 RTS 부품이 아니라
        /// 이 게임의 규칙으로 만드는 조건이다.
        /// </para>
        /// </summary>
        public bool Build(int side)
        {
            var p = Players[side];
            int tileId = Board.TileAt(p.Avatar.Pos);
            var tile = Board.At(tileId);

            // **몸이 있어야 짓는다.** 없으면 아바타가 마지막에 서 있던 자리로
            // 판정이 나서 거절 사유가 실제 이유와 달라진다(GDD 4.4).
            if (!p.Avatar.Embodied) return Deny(side, "강림해서 그 자리에 서야 짓는다");
            if (tileId == p.KeepTile) return Deny(side, "본진에는 못 짓는다");
            if (tile.Owner != side) return Deny(side, "내 땅에서만 짓는다");
            foreach (var b in Buildings)
            {
                if (b.Tile == tileId) return Deny(side, "이 칸에는 이미 있다");
            }
            if (p.Silver < Forge.Cost) return Deny(side, $"은이 {Forge.Cost} 필요하다");

            p.Silver -= Forge.Cost;
            Buildings.Add(new Building
            {
                Id = _nextId++,
                Side = side,
                Tile = tileId,
                Pos = Board.ClampToLand(p.Avatar.Pos),
                Hp = Forge.Hp,
                MaxHp = Forge.Hp,
                Raising = Forge.RaiseSeconds,
            });
            Note("전진 기지를 올린다", side);
            return true;
        }

        private bool Deny(int side, string why)
        {
            Note(why, side);
            return false;
        }

        /// <summary>완성된 내 기지들. 생산과 시야가 여기서 나온다.</summary>
        public List<Building> ForgesOf(int side)
        {
            var outp = new List<Building>();
            foreach (var b in Buildings)
            {
                if (b.Side == side && b.Raising <= 0 && b.Hp > 0) outp.Add(b);
            }
            return outp;
        }

        public bool Enqueue(int side, UnitKind kind)
        {
            var p = Players[side];
            var def = Units_Def(kind);
            if (p.Queue.Count >= Tuning.MaxQueue) return false;
            if (def.Civilian)
            {
                if (CountWorkers(side) + Queued(side, true) >= Tuning.MaxWorkers) return false;
            }
            else if (CountUnits(side) + Queued(side, false) >= Tuning.MaxUnits)
            {
                return false;
            }
            if (p.Silver < def.Cost) return false;
            p.Silver -= def.Cost;
            p.Queue.Add(new QueueItem { Kind = kind, Remain = def.BuildSeconds });
            return true;
        }

        /// <summary>
        /// **병력만** 센다. 일꾼은 여기 안 들어간다 (GDD 4.6).
        /// </summary>
        public int CountUnits(int side)
        {
            int n = 0;
            foreach (var u in Units)
            {
                if (u.Fac == side && !Units_Def(u.Kind).Civilian) n++;
            }
            return n;
        }

        public int CountWorkers(int side)
        {
            int n = 0;
            foreach (var u in Units)
            {
                if (u.Fac == side && Units_Def(u.Kind).Civilian) n++;
            }
            return n;
        }

        /// <summary>큐에 들어 있는 것 중 일꾼(또는 병사)의 수.</summary>
        private int Queued(int side, bool civilian)
        {
            int n = 0;
            foreach (var it in Players[side].Queue)
            {
                if (Units_Def(it.Kind).Civilian == civilian) n++;
            }
            return n;
        }

        // ───────────────────────────────────────────────────────── 진행

        public void Update(double dt)
        {
            if (Phase == Phase.Over)
            {
                EndTimer += dt;
                return;
            }
            Telemetry.Elapsed += dt;
            foreach (var p in Players)
            {
                if (p.Avatar.Embodied && p.Side == HumanSide) Telemetry.TimeInFirstPerson += dt;
            }

            TickAvatars(dt);
            MarkCommanded();
            UpdateUnits(dt);
            ResolveOverlap();
            UpdateCamps();
            UpdateBuildings(dt);
            UpdateTiles(dt);
            UpdateEconomy(dt);
            UpdateEffects(dt);
            RefreshVisibility();
            CheckEnd();
            TrimLog();
        }

        /// <summary>
        /// 강림 대기시간만 흐른다. 신은 판 위를 걸어다니지 않는다.
        /// </summary>
        private void TickAvatars(double dt)
        {
            foreach (var p in Players)
            {
                if (p.Avatar.DescendIn > 0)
                {
                    p.Avatar.DescendIn = Math.Max(0, p.Avatar.DescendIn - dt);
                }
            }
        }

        /// <summary>
        /// 지휘 반경 판정 (GDD 3.1). 매 틱 다시 계산한다 — "반경을 옮긴다"가 곧
        /// "전력을 옮긴다"가 되는 것은 이 한 줄 때문이다.
        /// </summary>
        private void MarkCommanded()
        {
            double r2 = Tuning.CommandRadius * Tuning.CommandRadius;
            foreach (var u in Units)
            {
                // 일꾼은 지휘 반경 보너스를 안 받는다. 그런데 Commanded를 켜 두면
                // 발밑에 금색 링이 도는데, 그 링은 화면에서 "이 유닛이 지금 보너스를
                // 받고 있다"는 뜻이다. 안 받는 유닛에 켜면 링이 거짓말을 한다.
                if (u.Fac == Faction.Neutral || Units_Def(u.Kind).Civilian)
                {
                    u.Commanded = false;
                    continue;
                }
                var a = Players[u.Fac].Avatar;
                // 몸이 없으면 반경도 없다. 이 한 줄이 이번 설계 변경의 전부다.
                u.Commanded = a.Embodied && Det.Dist2(u.Pos, a.Pos) <= r2;
            }
        }

        private void UpdateUnits(double dt)
        {
            foreach (var u in Units)
            {
                if (u.Hp <= 0) continue;
                u.Tile = Board.TileAt(u.Pos);
                // 교전 깃발은 매 틱 지우고, 실제로 사거리 안에서 칠 때만 다시 켠다.
                u.Fighting = false;

                // 일꾼은 표적을 고르지 않는다. 싸우는 코드를 통째로 건너뛴다 —
                // Dps를 0으로 두는 것만으로는 붙어 서서 맞아 죽는 그림이 된다.
                if (Units_Def(u.Kind).Civilian)
                {
                    WorkerThinkStep(u, dt);
                    Advance(u, dt);
                    continue;
                }

                var target = PickTarget(u);
                if (target != null)
                {
                    Engage(u, target, dt);
                    continue;
                }

                if (u.Fac != Faction.Neutral)
                {
                    // 적 유닛이 없으면 건물을 친다. 전진 기지가 먼저, 그다음이 본진이다.
                    int enemy = 1 - u.Fac;
                    var ep = Players[enemy];
                    Building? forge = null;
                    foreach (var b in Buildings)
                    {
                        if (b.Side == enemy && b.Tile == u.Tile && b.Hp > 0) { forge = b; break; }
                    }
                    if (forge != null)
                    {
                        HitBuilding(u, forge, dt);
                        continue;
                    }
                    if (u.Tile == ep.KeepTile && ep.KeepHp > 0)
                    {
                        var kd = Board.Defs[ep.KeepTile];
                        if (SwingAt(u, dt, new Vec2(kd.X, kd.Z)))
                        {
                            ep.KeepHp = Math.Max(0, ep.KeepHp - DamageFrom(u) * Units_Def(u.Kind).Swing);
                        }
                        continue;
                    }
                    Autonomy(u, dt);
                }
                Advance(u, dt);
            }

            // 죽은 것 치우기 — 시신을 남긴다. 조용히 사라지면 이겼는지 졌는지 모른다.
            for (int i = Units.Count - 1; i >= 0; i--)
            {
                var u = Units[i];
                if (u.Hp > 0) continue;
                Corpses.Add(new Corpse
                {
                    Pos = u.Pos,
                    Facing = u.Facing,
                    Kind = u.Kind,
                    Fac = u.Fac,
                    Life = 1,
                });
                foreach (var p in Players) if (p.FocusId == u.Id) p.FocusId = -1;
                Units.RemoveAt(i);
            }
        }

        /// <summary>
        /// 표적 고르기. **지휘받는 유닛은 내가 지목한 놈부터 친다**(GDD 3.1).
        /// 반경 밖 유닛은 지목을 못 듣고 알아서 가까운 놈을 친다.
        /// </summary>
        private Unit? PickTarget(Unit u)
        {
            if (u.Fac != Faction.Neutral && u.Commanded)
            {
                int focus = Players[u.Fac].FocusId;
                if (focus >= 0)
                {
                    Unit? t = null;
                    foreach (var o in Units)
                    {
                        if (o.Id == focus && o.Hp > 0) { t = o; break; }
                    }
                    if (t != null && t.Fac != u.Fac && Det.Dist(u.Pos, t.Pos) <= FocusRange) return t;
                }
            }

            Unit? best = null;
            double bestD = double.PositiveInfinity;
            foreach (var o in Units)
            {
                if (o.Hp <= 0 || o.Fac == u.Fac) continue;
                if (u.Fac == Faction.Neutral && o.Tile != u.AnchorTile) continue;
                if (o.Fac == Faction.Neutral && o.Tile != o.AnchorTile) continue;
                double d = Det.Dist(u.Pos, o.Pos);
                if (d > Aggro) continue;
                if (d < bestD)
                {
                    bestD = d;
                    best = o;
                }
            }
            return best;
        }

        /// <summary>
        /// 교전. **끊어 친다.** <c>Swing</c> 간격마다 한 대씩 들어가고, 그때마다
        /// 내지르고 · 번쩍이고 · 불꽃이 튄다.
        /// </summary>
        private void Engage(Unit u, Unit target, double dt)
        {
            var def = Units_Def(u.Kind);
            double d = Det.Dist(u.Pos, target.Pos);
            double reach = def.Range + (def.Radius + Units_Def(target.Kind).Radius) * BodySpacing;
            u.Facing = Det.Atan2(target.Pos.X - u.Pos.X, target.Pos.Z - u.Pos.Z);

            if (d > reach)
            {
                double sp = def.Speed * (u.Commanded ? CommandedBonus.Speed : 1);
                var next = Det.MoveToward(u.Pos, target.Pos, sp * dt);
                // 쫓아갈 때도 물에는 안 들어간다. 해안에 비스듬히 부딪히면 미끄러진다.
                u.Pos = Board.Slide(u.Pos, next);
                return;
            }

            u.Fighting = true;
            u.SwingIn -= dt;
            if (u.SwingIn > 0) return;

            double swing = u.Fac == Faction.Neutral ? 0.85 : def.Swing;
            u.SwingIn = swing;
            u.Lunge = 1;

            // 방패벽이 실제로 막아낸 순간인가 — 반경 안의 방패병만 해당한다.
            bool guarded = target.Fac != Faction.Neutral && target.Commanded
                && target.Kind == UnitKind.Shield;
            double dmg = DamageFrom(u) * DamageMultiplierOn(target) * swing;
            target.Hp -= dmg;
            target.Flash = 1;
            if (guarded) target.Guard = 1;

            // 타격 자국은 두 몸 사이에 남긴다.
            Hits.Add(new Hit
            {
                Pos = new Vec2((u.Pos.X + target.Pos.X) / 2, (u.Pos.Z + target.Pos.Z) / 2),
                Life = 1,
                Big = u.Fac != Faction.Neutral && u.Commanded && u.Kind == UnitKind.Axe,
                Guarded = guarded,
            });

            if (target.Fac == Faction.Neutral && u.Fac != Faction.Neutral)
            {
                var camp = Board.At(target.AnchorTile).Neutral;
                if (camp != null) camp.LastDamager = u.Fac;
            }
        }

        /// <summary>건물을 친다. 유닛을 칠 때와 같은 리듬으로 끊어 친다.</summary>
        private void HitBuilding(Unit u, Building b, double dt)
        {
            u.Facing = Det.Atan2(b.Pos.X - u.Pos.X, b.Pos.Z - u.Pos.Z);
            if (!SwingAt(u, dt, b.Pos)) return;
            b.Hp -= DamageFrom(u) * Units_Def(u.Kind).Swing;
            if (b.Hp <= 0)
            {
                b.Hp = 0;
                Note("전진 기지가 무너졌다", b.Side);
            }
        }

        /// <summary>
        /// 스윙 타이머를 굴리고, 이번 틱에 실제로 때렸는지 알려준다. 유닛과 건물이
        /// 같은 함수를 쓰는 이유는 리듬이 같아야 하기 때문이다.
        /// </summary>
        private bool SwingAt(Unit u, double dt, Vec2 at)
        {
            u.Fighting = true;
            u.SwingIn -= dt;
            if (u.SwingIn > 0) return false;
            u.SwingIn = Units_Def(u.Kind).Swing;
            u.Lunge = 1;
            Hits.Add(new Hit { Pos = at, Life = 1, Big = false, Guarded = false });
            return true;
        }

        /// <summary>도끼병은 반경 안에서 더 때린다(GDD 6.2 방패벽 보너스).</summary>
        private double DamageFrom(Unit u)
        {
            var def = Units_Def(u.Kind);
            double dps = def.Dps;
            if (u.Fac == Faction.Neutral)
            {
                var camp = Board.At(u.AnchorTile).Neutral;
                if (camp != null) dps = FjordNeutrals.Of(camp.Kind).GuardDps;
            }
            else if (u.Commanded && u.Kind == UnitKind.Axe)
            {
                dps *= CommandedBonus.AxeAttack;
            }
            return dps;
        }

        /// <summary>방패병은 반경 안에서 덜 맞는다.</summary>
        private double DamageMultiplierOn(Unit target)
        {
            if (target.Fac == Faction.Neutral) return 1;
            double m = Units_Def(target.Kind).DamageTaken;
            if (target.Commanded && target.Kind == UnitKind.Shield) m /= CommandedBonus.ShieldDefense;
            return m;
        }

        /// <summary>
        /// 반경 밖 유닛의 자율 행동 (GDD 3.1). 집결 지점의 **칸까지만** 알고,
        /// 즉시 반응하지 않는다 — 이 굼뜸이 "지휘받지 못한 부대"의 실제 감각이다.
        /// </summary>
        private void Autonomy(Unit u, double dt)
        {
            // 직접 명령을 받은 유닛은 건드리지 않는다.
            if (u.Ordered) return;
            u.ThinkIn -= dt;
            if (u.ThinkIn > 0) return;
            u.ThinkIn = AutonomyThink;

            var p = Players[u.Fac];
            if (u.Tile == p.RallyTile)
            {
                u.Path.Clear();
                u.DestTile = -1;
                return;
            }
            Repath(u, p.RallyTile);
        }

        /// <summary>
        /// 일꾼의 판단 (GDD 4.6).
        ///
        /// <para>
        /// **정원이 안 찬 내 땅 중 본진에서 가장 가까운 칸**으로 간다. 적이 밟고
        /// 있는 칸은 후보에서 빠지므로 전선이 밀리면 알아서 뒤로 물러난다 —
        /// 부감에서 일꾼을 하나하나 옮기게 만들면 강림할 손이 없어진다.
        /// </para>
        /// <para>
        /// 뒤에서부터 채우는 것은 의도다. 앞 칸을 일구려면 그 칸을 먼저 안전하게
        /// 만들어야 하고, 그것이 곧 지휘 반경을 앞으로 옮기는 일이다.
        /// </para>
        /// </summary>
        private void WorkerThinkStep(Unit u, double dt)
        {
            u.ThinkIn -= dt;
            if (u.ThinkIn > 0) return;
            u.ThinkIn = WorkerThink;

            int side = u.Fac;
            int want = WorkerTile(u, side);
            if (want < 0)
            {
                // 일굴 땅이 없다. 본진으로 물러나 기다린다.
                int keep = Players[side].KeepTile;
                if (u.Tile != keep) Repath(u, keep);
                return;
            }
            if (u.Tile == want)
            {
                u.Path.Clear();
                // 목적지는 남겨 둔다 — 칸별 정원을 셀 때 여기 서 있는 것도 한 자리다.
                u.DestTile = want;
                return;
            }
            Repath(u, want);
        }

        /// <summary>이 일꾼이 갈 칸. 없으면 -1. 칸 id 순으로 훑으므로 동점은 낮은 id가 이긴다.</summary>
        private int WorkerTile(Unit u, int side)
        {
            var taken = new int[Board.Defs.Count];
            foreach (var o in Units)
            {
                if (o.Hp <= 0 || o.Id == u.Id) continue;
                if (o.Fac != side || !Units_Def(o.Kind).Civilian) continue;
                // 가는 중인 일꾼도 그 칸의 한 자리를 이미 차지한 것으로 센다.
                // 안 그러면 여섯이 전부 같은 칸으로 몰린다.
                taken[o.DestTile >= 0 ? o.DestTile : o.Tile]++;
            }

            var hostile = new HashSet<int>();
            foreach (var o in Units)
            {
                if (o.Hp <= 0 || o.Fac == side) continue;
                hostile.Add(o.Tile);
            }

            int best = -1;
            double bestD = double.PositiveInfinity;
            int keepTile = Players[side].KeepTile;
            foreach (var t in Board.Tiles)
            {
                int id = t.Def.Id;
                if (t.Owner != side) continue;
                if (hostile.Contains(id)) continue;
                if (taken[id] >= Tuning.WorkersPerTile) continue;
                double d = Board.TilePath(keepTile, id).Count;
                if (d < bestD)
                {
                    bestD = d;
                    best = id;
                }
            }
            return best;
        }

        /// <summary>지금 실제로 땅을 일구고 있는 일꾼 수. 칸마다 정원까지만 센다.</summary>
        private int WorkedCount(int side)
        {
            var on = new int[Board.Defs.Count];
            foreach (var u in Units)
            {
                if (u.Hp <= 0 || u.Fac != side || !Units_Def(u.Kind).Civilian) continue;
                if (Board.At(u.Tile).Owner != side) continue;
                on[u.Tile]++;
            }
            int n = 0;
            for (int i = 0; i < on.Length; i++) n += Math.Min(on[i], Tuning.WorkersPerTile);
            return n;
        }

        private void Repath(Unit u, int destTile, Vec2? finalPoint = null)
        {
            if (u.Tile == destTile && !finalPoint.HasValue)
            {
                u.Path.Clear();
                u.DestTile = -1;
                return;
            }
            u.DestTile = destTile;
            // 지역 중심이 물일 수 있으므로 대표점을 쓴다(Board.Anchor).
            u.Path = Board.Route(u.Pos, finalPoint ?? Board.Anchor(destTile));
        }

        private void Advance(Unit u, double dt)
        {
            if (u.Path.Count == 0) return;
            var next = u.Path[0];
            var def = Units_Def(u.Kind);
            double sp = def.Speed * (u.Commanded ? CommandedBonus.Speed : 1);
            var moved = Det.MoveToward(u.Pos, next, sp * dt);
            double dx = moved.X - u.Pos.X;
            double dz = moved.Z - u.Pos.Z;
            if (Det.Hypot(dx, dz) > 1e-4) u.Facing = Det.Atan2(dx, dz);
            u.Pos = moved;
            if (Det.Dist(u.Pos, next) < 0.5)
            {
                u.Path.RemoveAt(0);
                // **도착해도 명령을 풀지 않는다.** 풀면 자율 판단이 깨어나
                // 집결 지점으로 돌아가고, 그러면 점령한 땅을 지킬 수가 없다.
                // 푸는 것은 새 우클릭이거나 새 집결 지점이다(SetRally).
            }
        }

        /// <summary>겹침 밀어내기. 대열이 한 점에 뭉치면 방패벽이 안 보인다.</summary>
        private void ResolveOverlap()
        {
            int n = Units.Count;
            for (int i = 0; i < n; i++)
            {
                var a = Units[i];
                if (a.Hp <= 0) continue;
                for (int j = i + 1; j < n; j++)
                {
                    var b = Units[j];
                    if (b.Hp <= 0) continue;
                    double min = (Units_Def(a.Kind).Radius + Units_Def(b.Kind).Radius) * BodySpacing;
                    double dx = b.Pos.X - a.Pos.X;
                    double dz = b.Pos.Z - a.Pos.Z;
                    double d2 = dx * dx + dz * dz;
                    if (d2 >= min * min || d2 < 1e-6) continue;
                    double d = Math.Sqrt(d2);
                    double push = (min - d) / 2;
                    double ux = dx / d;
                    double uz = dz / d;
                    a.Pos = new Vec2(a.Pos.X - ux * push, a.Pos.Z - uz * push);
                    b.Pos = new Vec2(b.Pos.X + ux * push, b.Pos.Z + uz * push);
                }
            }
        }

        /// <summary>캠프가 뚫렸는지 보고 보상을 준다 (GDD 4.3).</summary>
        private void UpdateCamps()
        {
            var alive = new HashSet<int>();
            foreach (var u in Units) if (u.Hp > 0) alive.Add(u.Id);

            foreach (var tile in Board.Tiles)
            {
                var camp = tile.Neutral;
                if (camp == null || camp.Cleared) continue;
                var kept = new List<int>();
                foreach (var id in camp.Guards) if (alive.Contains(id)) kept.Add(id);
                camp.Guards = kept;
                if (camp.Guards.Count > 0) continue;

                camp.Cleared = true;
                var def = FjordNeutrals.Of(camp.Kind);
                int winner = camp.LastDamager;
                if (winner == Faction.Nobody) continue;

                if (def.RewardSilver > 0)
                {
                    Players[winner].Silver += def.RewardSilver;
                    Note($"{def.Name} — 은 {def.RewardSilver}", winner);
                }
                if (def.RewardUnits != null)
                {
                    foreach (var kind in def.RewardUnits) SpawnUnit(winner, kind, tile.Def.Id);
                    Note($"{def.Name}이 합류했다", winner);
                }
                if (def.GrantsOutpost)
                {
                    Note($"{def.Name} — 점령하면 전초가 된다", winner);
                }
            }
        }

        /// <summary>짓는 중인 기지를 올리고, 무너진 것을 치운다.</summary>
        private void UpdateBuildings(double dt)
        {
            for (int i = Buildings.Count - 1; i >= 0; i--)
            {
                var b = Buildings[i];
                if (b.Hp <= 0)
                {
                    Buildings.RemoveAt(i);
                    continue;
                }
                if (b.Raising > 0)
                {
                    b.Raising -= dt;
                    if (b.Raising <= 0)
                    {
                        b.Raising = 0;
                        Note("전진 기지가 섰다 — 병력이 여기서 나온다", b.Side);
                    }
                }
                // 남의 땅이 된 기지는 스스로 무너진다.
                if (Board.At(b.Tile).Owner == 1 - b.Side) b.Hp -= 45 * dt;
            }
        }

        /// <summary>흔적을 삭힌다. 판정과 무관하므로 순서는 아무 데나 와도 된다.</summary>
        private void UpdateEffects(double dt)
        {
            foreach (var u in Units)
            {
                if (u.Lunge > 0) u.Lunge = Math.Max(0, u.Lunge - dt / LungeFade);
                if (u.Flash > 0) u.Flash = Math.Max(0, u.Flash - dt / FlashFade);
                if (u.Guard > 0) u.Guard = Math.Max(0, u.Guard - dt / FlashFade);
            }
            for (int i = Hits.Count - 1; i >= 0; i--)
            {
                Hits[i].Life -= dt / HitFade;
                if (Hits[i].Life <= 0) Hits.RemoveAt(i);
            }
            for (int i = Corpses.Count - 1; i >= 0; i--)
            {
                Corpses[i].Life -= dt / CorpseFade;
                if (Corpses[i].Life <= 0) Corpses.RemoveAt(i);
            }
            // 죽은 놈을 계속 지목하고 있을 수는 없다.
            foreach (var p in Players)
            {
                if (p.FocusId < 0) continue;
                bool found = false;
                foreach (var u in Units)
                {
                    if (u.Id == p.FocusId && u.Hp > 0) { found = true; break; }
                }
                if (!found) p.FocusId = -1;
            }
        }

        private void UpdateTiles(double dt)
        {
            // 칸마다 양측 유닛 수를 세고 점령을 굴린다.
            int n = Board.Defs.Count;
            var p0 = new int[n];
            var p1 = new int[n];
            foreach (var u in Units)
            {
                if (u.Hp <= 0 || u.Fac == Faction.Neutral) continue;
                if (u.Fac == 0) p0[u.Tile]++; else p1[u.Tile]++;
            }
            // 아바타도 그 자리에 있다. 무적이지만 땅을 밟고 서 있는 것은 사실이다.
            foreach (var p in Players)
            {
                int t = Board.TileAt(p.Avatar.Pos);
                if (p.Side == 0) p0[t]++; else p1[t]++;
            }
            foreach (var d in Board.Defs) Board.UpdateCapture(d.Id, p0[d.Id], p1[d.Id], dt);
        }

        private void UpdateEconomy(double dt)
        {
            foreach (var p in Players)
            {
                int tiles = Board.OwnedBy(p.Side);
                var forges = ForgesOf(p.Side);
                // 일꾼은 **자기가 선 내 땅**의 수입을 올린다. 자원 노드가 없는 이유는
                // 이 게임의 경제가 애초에 땅이기 때문이다(GDD 4.6).
                p.Silver += (Tuning.SilverBasePerSecond
                             + tiles * Tuning.SilverPerTilePerSecond
                             + forges.Count * Forge.SilverPerSecond
                             + WorkedCount(p.Side) * Tuning.SilverPerWorker) * dt;

                if (p.Queue.Count == 0) continue;
                var head = p.Queue[0];
                head.Remain -= dt;
                if (head.Remain > 0) continue;
                p.Queue.RemoveAt(0);
                SpawnUnit(p.Side, head.Kind, SpawnTile(p, forges));
            }
        }

        /// <summary>
        /// 새 병력이 어디서 나오는가. **집결 지점에 가장 가까운 내 건물**에서 나온다 —
        /// 이것이 전진 기지의 값어치 전부다.
        /// </summary>
        private int SpawnTile(PlayerState p, List<Building> forges)
        {
            int best = p.KeepTile;
            int bestD = Board.TilePath(p.KeepTile, p.RallyTile).Count;
            foreach (var f in forges)
            {
                int d = Board.TilePath(f.Tile, p.RallyTile).Count;
                if (d < bestD)
                {
                    bestD = d;
                    best = f.Tile;
                }
            }
            return best;
        }

        private void RefreshVisibility()
        {
            for (int side = 0; side < 2; side++)
            {
                var sources = new List<(Vec2, double)>();
                var p = Players[side];
                var keep = Board.Defs[p.KeepTile];
                sources.Add((new Vec2(keep.X, keep.Z), Tuning.VisionKeep));
                // 몸이 있을 때만 신의 눈이 열린다.
                if (p.Avatar.Embodied) sources.Add((p.Avatar.Pos, Tuning.VisionAvatar));
                foreach (var u in Units)
                {
                    if (u.Fac != side || u.Hp <= 0) continue;
                    sources.Add((u.Pos, Tuning.VisionUnit));
                }
                foreach (var t in Board.Tiles)
                {
                    if (t.Outpost && t.Owner == side)
                    {
                        sources.Add((new Vec2(t.Def.X, t.Def.Z), Tuning.VisionOutpost));
                    }
                }
                foreach (var b in ForgesOf(side)) sources.Add((b.Pos, Forge.Vision));
                Visible[side] = Board.ComputeVisible(sources, side);
            }
        }

        private void CheckEnd()
        {
            foreach (var p in Players)
            {
                if (p.KeepHp > 0) continue;
                Phase = Phase.Over;
                End = new EndState { Winner = 1 - p.Side, Reason = "keep" };
                EndTimer = 0;
                return;
            }
        }

        private void Note(string text, int side)
        {
            if (side != HumanSide) return;
            Log.Add(new LogEntry { Text = text, At = Telemetry.Elapsed });
        }

        private void TrimLog()
        {
            while (Log.Count > 0 && Telemetry.Elapsed - Log[0].At > 5) Log.RemoveAt(0);
        }

        // ───────────────────────────────────────────────────────── 읽기용

        /// <summary>이 진영이 지금 저 유닛을 볼 수 있는가.</summary>
        public bool CanSee(int side, Unit u) => Visible[side].Contains(u.Tile);

        /// <summary>반경 안에 있는 아군 수. HUD가 이 숫자를 띄운다.</summary>
        public int CommandedCount(int side)
        {
            int n = 0;
            foreach (var u in Units) if (u.Fac == side && u.Commanded && u.Hp > 0) n++;
            return n;
        }

        public int CenterTile() => LandMap.Center;
    }
}
