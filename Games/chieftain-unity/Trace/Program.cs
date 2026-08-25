using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Chieftain.Core;

/// <summary>
/// 결정론 대조 하네스 (C# 쪽).
///
/// <para>
/// <c>Games/chieftain/tools/trace.ts</c>와 **글자 하나까지 같은 형식**으로 매 틱
/// 상태를 뱉는다. 두 출력을 <c>diff</c>로 비교하면 diff의 첫 줄이 곧 "몇 번째 틱,
/// 어느 값에서 갈라졌는가"가 된다.
/// </para>
/// <para>
/// 부동소수는 비트 패턴으로 찍는다. 십진수로 찍으면 반올림이 차이를 덮어서 마지막
/// 비트만 어긋난 진짜 발산을 놓치는데, 락스텝에서는 그 한 비트가 판을 가른다.
/// </para>
/// </summary>
internal static class Program
{
    private static string D(double v) =>
        BitConverter.DoubleToUInt64Bits(v).ToString("x16", CultureInfo.InvariantCulture);

    private static string B(bool v) => v ? "1" : "0";

    /// <summary>TS 쪽은 유닛 종류를 문자열로 들고 있다. 형식을 맞춘다.</summary>
    private static string K(UnitKind k) => k == UnitKind.Shield ? "shield" : "axe";

    private static string N(NeutralKind k) =>
        k == NeutralKind.Mercenary ? "mercenary" : k == NeutralKind.Creature ? "creature" : "ruin";

    private static int Main(string[] args)
    {
        uint seed = args.Length > 0 ? uint.Parse(args[0], CultureInfo.InvariantCulture) : 12345u;
        int ticks = args.Length > 1 ? int.Parse(args[1], CultureInfo.InvariantCulture) : 1800;

        var game = new Game(seed, 0);
        var ai = new Ai(game, 1);
        var sb = new StringBuilder();

        void Dump(int tick)
        {
            sb.Append("T ").Append(tick).Append(' ').Append(D(game.Telemetry.Elapsed))
              .Append(' ').Append(game.Phase == Phase.Playing ? "playing" : "over").Append('\n');

            foreach (var p in game.Players)
            {
                var a = p.Avatar;
                var q = new List<string>();
                foreach (var i in p.Queue) q.Add($"{K(i.Kind)}:{D(i.Remain)}");
                string mt = a.MoveTarget.HasValue
                    ? $"{D(a.MoveTarget.Value.X)}/{D(a.MoveTarget.Value.Z)}"
                    : "-";
                sb.Append("P ").Append(p.Side).Append(' ').Append(D(p.Silver)).Append(' ')
                  .Append(D(p.KeepHp)).Append(' ').Append(D(a.Pos.X)).Append(' ').Append(D(a.Pos.Z))
                  .Append(' ').Append(D(a.Yaw)).Append(' ').Append(B(a.Driving)).Append(' ')
                  .Append(mt).Append(' ').Append(D(p.Rally.X)).Append(' ').Append(D(p.Rally.Z))
                  .Append(' ').Append(p.RallyTile).Append(' ').Append(p.FocusId)
                  .Append(" [").Append(string.Join(",", q)).Append("]\n");
            }

            foreach (var u in game.Units)
            {
                sb.Append("U ").Append(u.Id).Append(' ').Append(u.Fac).Append(' ').Append(K(u.Kind))
                  .Append(' ').Append(D(u.Pos.X)).Append(' ').Append(D(u.Pos.Z)).Append(' ')
                  .Append(D(u.Hp)).Append(' ').Append(u.Tile).Append(' ').Append(D(u.Facing))
                  .Append(' ').Append(D(u.SwingIn)).Append(' ').Append(B(u.Commanded)).Append(' ')
                  .Append(B(u.Fighting)).Append(' ').Append(u.DestTile).Append(' ')
                  .Append(u.Path.Count).Append(' ').Append(D(u.ThinkIn)).Append(' ')
                  .Append(D(u.Lunge)).Append(' ').Append(D(u.Flash)).Append(' ').Append(D(u.Guard))
                  .Append(' ').Append(u.AnchorTile).Append('\n');
            }

            foreach (var t in game.Board.Tiles)
            {
                var c = t.Neutral;
                string camp = c != null
                    ? $"{N(c.Kind)}/{B(c.Cleared)}/{c.LastDamager}/{c.Guards.Count}"
                    : "-";
                sb.Append("L ").Append(t.Def.Id).Append(' ').Append(D(t.Hold)).Append(' ')
                  .Append(t.Owner).Append(' ').Append(B(t.Outpost)).Append(' ').Append(camp)
                  .Append(' ').Append(B(t.Seen[0])).Append(B(t.Seen[1])).Append('\n');
            }

            foreach (var bd in game.Buildings)
            {
                sb.Append("B ").Append(bd.Id).Append(' ').Append(bd.Side).Append(' ')
                  .Append(bd.Tile).Append(' ').Append(D(bd.Pos.X)).Append(' ').Append(D(bd.Pos.Z))
                  .Append(' ').Append(D(bd.Hp)).Append(' ').Append(D(bd.Raising)).Append('\n');
            }

            var v0 = new List<int>(game.Visible[0]); v0.Sort();
            var v1 = new List<int>(game.Visible[1]); v1.Sort();
            sb.Append("V ").Append(string.Join(",", v0)).Append(" | ")
              .Append(string.Join(",", v1)).Append('\n');
        }

        Dump(0);
        for (int i = 1; i <= ticks; i++)
        {
            // main.ts와 같은 순서다 — AI가 먼저 명령을 내리고 그다음 판이 한 스텝 간다.
            ai.Update(Loop.FixedDt);
            game.Update(Loop.FixedDt);
            Dump(i);
        }

        Console.Out.Write(sb.ToString());
        return 0;
    }
}
