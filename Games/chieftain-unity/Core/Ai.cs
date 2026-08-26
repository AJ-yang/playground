using System;
using System.Collections.Generic;

namespace Chieftain.Core
{
    /// <summary>
    /// 컴퓨터 상대 (GDD 6.3).
    ///
    /// <para>
    /// **아바타를 사람과 똑같이 쓴다** — 급하면 강림해서 직접 몰고, 자리를 잡으면
    /// 올라온다. 난이도 문제가 아니라 실험 설계의 문제다. AI가 지휘 반경을 쓸 줄
    /// 모르면 사람은 그 규칙을 몰라도 이기고, 그러면 "규칙 모르는 사람 3명이 스스로
    /// 강림하는가"라는 판정(GDD 6.5)이 무의미해진다.
    /// </para>
    /// </summary>
    public sealed class Ai
    {
        /// <summary>생각을 고치는 주기. 매 틱 다시 재면 부대가 갈팡질팡한다.</summary>
        private const double Think = 1.1;

        /// <summary>캠프를 뚫으러 갈 최소 병력. 이보다 적으면 수비대에게 녹는다.</summary>
        private const int CampMinArmy = 3;

        /// <summary>다음 경유지에 이만큼 가까워지면 도달로 친다.</summary>
        private const double WaypointReach = 1.6;

        private readonly Game _game;
        private readonly int _side;

        private double _thinkIn;
        private List<Vec2> _route = new List<Vec2>();
        private int _targetTile = -1;

        public Ai(Game game, int side)
        {
            _game = game;
            _side = side;
        }

        public void Update(double dt)
        {
            var g = _game;
            if (g.Phase != Phase.Playing) return;

            _thinkIn -= dt;
            if (_thinkIn <= 0)
            {
                _thinkIn = Think;
                Produce();
                BuildIfWorth();
                Decide();
            }
            MoveAvatar(dt);
        }

        // ─────────────────────────────────────────────────────── 생산

        private void Produce()
        {
            var g = _game;
            var p = g.Players[_side];
            if (p.Queue.Count >= 2) return;

            // 방패병이 절반은 되게 유지한다. 도끼병만 뽑으면 반경 밖에서 순식간에
            // 녹고, 그러면 지휘 반경이 있으나 없으나 같은 게임이 되어 버린다.
            /*
             * 일꾼을 먼저 본다.
             *
             * **AI가 경제를 안 쓰면 사람은 경제를 안 써도 이긴다.** 그러면 GDD 4.6이
             * 넣은 결정("언제 은을 경제로 돌릴 것인가")이 실험대에 아예 안 오른다.
             * 목표치는 일굴 땅이 있는 만큼이다 — 정원이 찬 뒤에도 뽑으면 은만 논다.
             */
            int workers = g.CountWorkers(_side);
            int room = g.Board.OwnedBy(_side) * Tuning.WorkersPerTile;
            if (workers < Math.Min(Tuning.MaxWorkers, room))
            {
                if (g.Enqueue(_side, UnitKind.Worker)) return;
            }

            int shields = 0, axes = 0;
            foreach (var u in g.Units)
            {
                if (u.Fac != _side) continue;
                if (u.Kind == UnitKind.Shield) shields++;
                else if (u.Kind == UnitKind.Axe) axes++;
            }
            var want = shields <= axes ? UnitKind.Shield : UnitKind.Axe;
            if (!g.Enqueue(_side, want))
            {
                g.Enqueue(_side, want == UnitKind.Shield ? UnitKind.Axe : UnitKind.Shield);
            }
        }

        /// <summary>
        /// 전진 기지를 세울 만한가. **사람과 같은 조건으로 짓는다** — 아바타가 선 칸이
        /// 내 땅이고 은이 있을 때. 본진에서 먼 칸일수록 값이 크다.
        /// </summary>
        private void BuildIfWorth()
        {
            var g = _game;
            var p = g.Players[_side];
            if (p.Silver < Forge.Cost + 60) return;
            if (g.ForgesOf(_side).Count >= 2) return;

            int here = g.Board.TileAt(p.Avatar.Pos);
            if (g.Board.At(here).Owner != _side) return;
            if (g.Board.TilePath(p.KeepTile, here).Count < 2) return;

            g.Build(_side);
        }

        // ─────────────────────────────────────────────────────── 판단

        private void Decide()
        {
            int target = ChooseTarget();
            if (target < 0) return;
            var g = _game;
            var d = g.Board.Defs[target];
            g.SetRally(_side, new Vec2(d.X, d.Z));

            if (target != _targetTile)
            {
                _targetTile = target;
                int from = g.Board.TileAt(g.Players[_side].Avatar.Pos);
                _route = g.Board.Route(from, target);
            }
        }

        /// <summary>
        /// 우선순위 목록. 위에서부터 걸리는 첫 항목이 목표가 된다.
        ///
        /// <list type="number">
        /// <item>내 땅이 밟히고 있으면 막는다 — 뺏기는 것이 먹는 것보다 아프다</item>
        /// <item>병력이 충분하면 가장 가까운 캠프를 뚫는다</item>
        /// <item>빈 땅이 남아 있으면 먹는다</item>
        /// <item>아니면 상대 본진으로 민다</item>
        /// </list>
        /// </summary>
        private int ChooseTarget()
        {
            var g = _game;
            int me = _side;
            int foe = 1 - me;
            int keep = g.Players[me].KeepTile;

            var enemyOn = new HashSet<int>();
            foreach (var u in g.Units)
            {
                if (u.Hp <= 0 || u.Fac != foe) continue;
                enemyOn.Add(u.Tile);
            }

            // 1. 방어 — 내 땅이나 본진이 밟혔다
            int threat = -1;
            double threatD = double.PositiveInfinity;
            foreach (var t in g.Board.Tiles)
            {
                if (t.Owner != me || !enemyOn.Contains(t.Def.Id)) continue;
                double d = g.Board.TilePath(keep, t.Def.Id).Count;
                if (d < threatD)
                {
                    threatD = d;
                    threat = t.Def.Id;
                }
            }
            if (threat >= 0) return threat;

            int army = g.CountUnits(me);

            // 2. 캠프 — 은과 병력이 여기서 나온다
            if (army >= CampMinArmy)
            {
                int camp = -1;
                double campD = double.PositiveInfinity;
                foreach (var t in g.Board.Tiles)
                {
                    var c = t.Neutral;
                    if (c == null || c.Cleared) continue;
                    // 상대 진영 깊숙한 캠프는 손대지 않는다. 거울상이라 내 쪽에도 같은 것이 있다.
                    double dMe = g.Board.TilePath(keep, t.Def.Id).Count;
                    double dFoe = g.Board.TilePath(g.Players[foe].KeepTile, t.Def.Id).Count;
                    if (dFoe < dMe) continue;
                    if (dMe < campD)
                    {
                        campD = dMe;
                        camp = t.Def.Id;
                    }
                }
                if (camp >= 0) return camp;
            }

            // 3. 빈 땅
            int open = -1;
            double openD = double.PositiveInfinity;
            foreach (var t in g.Board.Tiles)
            {
                if (t.Owner == me) continue;
                if (t.Neutral != null && !t.Neutral.Cleared) continue;
                if (t.Def.Id == g.Players[foe].KeepTile) continue;
                double d = g.Board.TilePath(keep, t.Def.Id).Count;
                if (d < openD)
                {
                    openD = d;
                    open = t.Def.Id;
                }
            }
            if (open >= 0 && army >= 2) return open;

            // 4. 본진으로
            return g.Players[foe].KeepTile;
        }

        // ─────────────────────────────────────────────────────── 아바타

        /// <summary>
        /// 아바타를 목표 칸으로 옮긴다. 멀면 **강림해서 직접 몰고**(빠름), 다 왔으면
        /// 올라온다. 사람이 하는 판단과 같은 판단을 같은 규칙으로 하는 것이다.
        /// </summary>
        private void MoveAvatar(double dt)
        {
            var g = _game;
            var a = g.Players[_side].Avatar;
            if (_targetTile < 0) return;

            var goal = g.Board.Defs[_targetTile];
            var goalPoint = new Vec2(goal.X, goal.Z);

            // 다 왔으면 올라와서 자리를 지킨다.
            if (Det.Dist(a.Pos, goalPoint) < Tuning.CommandRadius * 0.45)
            {
                g.SetDriving(_side, false);
                a.MoveTarget = null;
                _route.Clear();
                return;
            }

            if (_route.Count == 0)
            {
                _route = g.Board.Route(g.Board.TileAt(a.Pos), _targetTile);
            }
            if (_route.Count == 0) return;
            var next = _route[0];

            g.SetDriving(_side, true);
            double dx = next.X - a.Pos.X;
            double dz = next.Z - a.Pos.Z;
            double l = Det.Hypot(dx, dz);
            if (l < WaypointReach)
            {
                _route.RemoveAt(0);
                return;
            }
            a.Yaw = Det.Atan2(dx, dz);
            g.DriveAvatar(_side, new Vec2(dx / l, dz / l), dt);
        }

        /// <summary>디버그용 — 지금 무엇을 하려는지.</summary>
        public string Intent
        {
            get
            {
                if (_targetTile < 0) return "—";
                var t = _game.Board.At(_targetTile);
                if (t.Neutral != null && !t.Neutral.Cleared) return "중립 정리";
                if (t.Owner == Faction.Nobody) return "빈 땅 점령";
                if (t.Owner == _side) return "방어";
                return t.Def.Id == _game.Players[1 - _side].KeepTile ? "본진 공격" : "진격";
            }
        }
    }
}
