import type { LevelDef } from './types';

/*
 * Campaign layouts. See dsl.ts for the format. Rows are listed in driving order.
 * Width 7 rows are 7 characters between the pipes, width 9 rows are 9; shorter rows are centred.
 *
 * Reference numbers at cruise speed (16 u/s), one row = 2 units:
 *   normal jump  ≈ 5.5 rows of air, apex ≈ 1.9 units
 *   launch pad   ≈ 7.7 rows of air, apex ≈ 3.7 units
 *   after a drag plate (8 u/s) a jump only covers ≈ 2.7 rows
 *
 * Every layout is driven end-to-end by the physics autopilot in tests/campaign.test.ts.
 */

const L1 = `
8|=======|
:hint Steer with A / D or the arrow keys. Stay on the road!
6|=======|
6| ===== |
8|  ===  |
4|  =o=  |
4|   === |
4|    ===|
3|    =o=|
4|   === |
4|  ===  |
4| ===   |
4|===    |
3|=o=    |
4| ===   |
6|  ===  |
6| ===== |
2|CCCCCCC|
:hint Press SPACE to jump over gaps
6|  ===  |
2|       |
6|  ===  |
1|   *   |
1|       |
8|  ===  |
2|       |
4|  ===  |
4| ===== |
2|       |
6| ===== |
:hint Hold W to accelerate, S to brake
8|=======|
4| =o=o= |
4|  ===  |
2|CCCCCCC|
4|  ===  |
2|   *   |
5|   === |
2|    *  |
5|    ===|
2|   *   |
5|  ===  |
2|  *    |
5| ===   |
2|       |
8|  ===  |
4| ===== |
2|CCCCCCC|
:hint Orbs are worth points. Weave to collect them!
4|  ===  |
4|  =o=  |
4|   =o= |
4|    =o=|
4|   =o= |
4|  =o=  |
4| =o=   |
4|=o=    |
4| =o=   |
4|  ===  |
2|       |
5|  ===  |
2|       |
5|   === |
2|       |
5|  ===  |
2|       |
5| ===   |
2|       |
6|  ===  |
2|CCCCCCC|
6|=======|
4|== = ==|
4|=======|
4|=  =  =|
4|=======|
2|       |
4| ===== |
2|  * *  |
6| ===== |
4|  ===  |
3|FFFFFFF|
6|=======|
`;

const L2 = `
8|=======|
6|  ===  |
2|       |
6|  ===  |
3|       |
:hint Longer gaps: hold W for more speed before you jump
8|  ===  |
3|   *   |
6|  ===  |
2|CCCCCCC|
:hint Raised blocks: jump on top and ride along them
4|  ===  |
6|  bbb  |
4|  ===  |
6|  bbb  |
2|       |
6|  bbb  |
4|  ===  |
2|CCCCCCC|
:hint Stepping stones: keep your rhythm
4|  ===  |
2|       |
3|  ===  |
2|       |
3|   === |
2|       |
3|    ===|
2|       |
3|   === |
2|       |
3|  ===  |
2|       |
6| ===== |
:hint Walls cannot be jumped. Steer around them!
6|=======|
3|==###==|
6|=======|
3|###==##|
6|=======|
3|##==###|
6|=======|
2|CCCCCCC|
6|  ===  |
3|       |
3|  =o=  |
3|       |
3|  ===  |
3|   *   |
3|  ===  |
2|       |
4|bbbbbbb|
3|bb   bb|
4|bbbbbbb|
2|       |
6| ===== |
3|       |
8|  ===  |
2|CCCCCCC|
:hint Gaps and offsets: aim your jump while airborne
6|  ===  |
3|       |
4|   === |
3|       |
4| ===   |
3|       |
4|   === |
3|       |
6|  ===  |
4|  bbb  |
4| bbbbb |
4|  bbb  |
2|       |
6|  ===  |
2|CCCCCCC|
6|=======|
3|##=##==|
6|=======|
3|==##=##|
6|=======|
2|       |
4| =o=o= |
3|       |
4| ===== |
2|       |
6|  ===  |
3|       |
5|  ===  |
3|   *   |
6|  ===  |
3|FFFFFFF|
6|=======|
`;

const L3 = `
6|=======|
:hint Green ACCELERATOR tiles push your speed up
6|  ===  |
8|  >>>  |
4|  ===  |
:hint With extra speed you can clear much longer gaps
4|       |
6|  ===  |
:hint Orange DRAG plates slow you down — careful before gaps
6|  <<<  |
6|  ===  |
2|       |
6|  ===  |
2|CCCCCCC|
:hint White BOOST strips give a short burst of speed
4|  ===  |
1|  !!!  |
8|  ===  |
4|       |
4|  =o=  |
4| ===== |
2|CCCCCCC|
:hint Branch! The left lane is faster but narrow
4|=======|
:alt 0 1 600 ACCEL LANE
6|=>   ==|
6|=>   <<|
4|o>   ==|
6|=>   <<|
:altend
4|=======|
4| ===== |
6|  >>>  |
5|       |
5|  =o=  |
4|  <<<  |
2|       |
6|  ===  |
2|CCCCCCC|
4|  ===  |
1|  !!!  |
3|  ===  |
4|       |
3|  ===  |
1|  !!!  |
3|  ===  |
4|   *   |
3|  ===  |
4|  >>>  |
6|       |
8|  ===  |
2|CCCCCCC|
:hint Drag plates then gaps: hold W to fight the slowdown
4|  ===  |
4|  <<<  |
2|       |
4|  ===  |
4|  <<<  |
2|       |
6|  ===  |
4| >>>>> |
5|       |
4|  =o=  |
4|  <=<  |
2|       |
6|  ===  |
2|CCCCCCC|
6|=======|
1|!!!!!!!|
6|=======|
6|>>   >>|
4|==   ==|
5|       |
6|  ===  |
1|  !!!  |
5|       |
6|  ===  |
4|<<<<<<<|
3|FFFFFFF|
6|=======|
`;

const L4 = `
6|=======|
:hint Blue ICE has almost no grip. Steer early and gently
8| ~~~~~ |
6| ===== |
2|CCCCCCC|
:hint Line up before the ice — you will slide
4|  ===  |
10|  ~~~  |
4|   === |
8|   ~~~ |
4|  ===  |
2|       |
6| ~~~~~ |
4| ===== |
2|CCCCCCC|
6|~~~~~~~|
3|~~~####|
8|~~~~~~~|
3|####~~~|
8|~~~~~~~|
3|~~~####|
6|~~~~~~~|
2|CCCCCCC|
6|  ~~~  |
2|       |
6|  ~~~  |
2|   *   |
6|  ~~~  |
3|       |
6| ===== |
:hint Ice sends you sliding — straighten up on solid ground
8|  ~=~  |
4|  =o=  |
8| ~~~~~ |
4|  ===  |
2|CCCCCCC|
:alt 5 6 700 GLACIER EDGE
6|==   ~~|
6|==   ~o|
6|==   ~~|
6|==   ~~|
:altend
4|=======|
10|  ~~~  |
2|CCCCCCC|
:hint Drifting lanes on ice: plan two moves ahead
4|  ===  |
4|  ~~~  |
4|   ~~~ |
4|    ~~~|
4|   ~~~ |
4|  ~~~  |
4| ~~~   |
4|~~~    |
4| ~~~   |
4|  ~~~  |
4|  ===  |
2|CCCCCCC|
6| ~~~~~ |
2|       |
6| ~~~~~ |
2|       |
6| ~o~o~ |
4| ~~~~~ |
2|  ~~~  |
4|  ===  |
4|  >>>  |
4|  ~~~  |
4|       |
8|  ===  |
3|FFFFFFF|
6|=======|
`;

const L5 = `
6|=======|
:hint Violet FRAGILE tiles collapse right after you cross them
8|  %%%  |
4|  ===  |
:hint The road vanishes behind you. There is no going back!
12|  %%%  |
4|  ===  |
2|CCCCCCC|
4|  ===  |
4|   %%% |
4|    %%%|
4|   %%% |
4|  %%%  |
4| %%%   |
4|%%%    |
4|=o=    |
4| ===   |
2|CCCCCCC|
:hint Fragile stepping stones
4|  ===  |
2|       |
3|  %%%  |
2|       |
3|  %o%  |
2|       |
3|  %%%  |
2|       |
6|  ===  |
2|CCCCCCC|
:hint Choose: safe drag plates, or a crumbling shortcut with orbs
4|=======|
:alt 5 6 700 CRUMBLE RUN
6|<<   %%|
6|<<   %o|
6|<<   %%|
6|<<   o%|
:altend
4|=======|
2|CCCCCCC|
8|%%%%%%%|
4|%%   %%|
4|%%%%%%%|
3|       |
6|  %%%  |
2|   *   |
6|  ===  |
2|CCCCCCC|
:hint The road is crumbling — and so are the blocks
4|  ===  |
6|  %%%  |
4|  bbb  |
4|  %%%  |
2|       |
4|  %%%  |
4|  >>>  |
5|       |
6|  %%%  |
2|CCCCCCC|
6|  ===  |
4| %%%%% |
4|%%% %%%|
4|%%   %%|
4|%%% %%%|
4| %%%%% |
2|       |
4|  %o%  |
2|       |
4|  %%%  |
2|       |
6|  ===  |
3|FFFFFFF|
6|=======|
`;

const L6 = `
8|=========|
:hint Red PLASMA burns on contact — never land on it
6|===xxx===|
6|=========|
6|xxx===xxx|
8|=========|
6|==xxxxx==|
4|=========|
2|CCCCCCCCC|
:hint Moving blocks slide across the road — time your pass
8|=========|
:obs 4 3 2.6 2 2
12|=========|
:obs 4 3 2.2 2 2 3.14
12|=========|
2|CCCCCCCCC|
6|  =====  |
4|  x=x=x  |
4|  =x=x=  |
4|  x=x=x  |
4|  =====  |
2|         |
6|  =x=x=  |
2|    *    |
6|  =====  |
2|CCCCCCCCC|
8|=========|
:obs 2 1.5 1.8 1.5 2
6|====x====|
:obs 6 1.5 1.8 1.5 2 3.14
6|====x====|
6|=========|
:alt 0 0 700 KNIFE EDGE
8|=xx======|
4|o========|
8|=xx======|
:altend
4|=========|
2|CCCCCCCCC|
6|  =====  |
:obs 4 2 1.5 1.5 3
10|  =====  |
2|         |
6|  =====  |
2|CCCCCCCCC|
:hint Plasma lanes shift — read the road ahead
6|=========|
4|xx=======|
4|xxxx=====|
4|xxxxxx===|
4|xxxx=====|
4|xx=======|
4|=======xx|
4|=====xxxx|
4|===xxxxxx|
4|=====xxxx|
4|=======xx|
6|=========|
2|CCCCCCCCC|
8|=========|
:obs 2 1.5 1.6 1.5 2
4|=========|
:obs 6 1.5 1.6 1.5 2 1.57
4|=========|
:obs 4 2.5 2.0 1.5 2 3.14
8|=========|
6|==x===x==|
2|         |
6|==x===x==|
6|xx=====xx|
3|FFFFFFFFF|
6|=========|
`;

const L7 = `
8|=======|
:hint Speed trial: chain accelerators and boosts, keep it straight
6|  >>>  |
6|  !!!  |
8|  ===  |
6|       |
8|  >>>  |
6|       |
6|  =o=  |
2|CCCCCCC|
6|   =   |
4|   >   |
4|   =   |
1|   !   |
8|   =   |
6|  ===  |
2|CCCCCCC|
:hint Launch pads throw you high — stay centred for the landing
4|  ===  |
1|  ^^^  |
4|       |
1|   *   |
1|       |
8|  ===  |
4|  >>>  |
6|       |
4| ===== |
1|  ^^^  |
6|       |
10|  ===  |
2|CCCCCCC|
6|  >>>  |
2|   =   |
3|   ==  |
3|    == |
3|   ==  |
3|  ==   |
3| ==    |
3|  ==   |
3|   =   |
6|  ===  |
4|  !!!  |
6|  ===  |
5|       |
6|  >>>  |
6|       |
8|  ===  |
2|CCCCCCC|
:hint Full throttle — the gaps only get longer
6|  >>>  |
5|       |
4|  ===  |
4|  >>>  |
6|       |
4|  ===  |
4|  >>>  |
7|       |
6|  ===  |
2|CCCCCCC|
4|  ===  |
1|  ^^^  |
4|       |
6|  >>>  |
6|       |
8|  ===  |
1|   !   |
6|   =   |
6|   >   |
6|       |
8|  ===  |
3|FFFFFFF|
6|=======|
`;

const L8 = `
8|=========|
:hint The circuit splits. Every branch reaches the finish
4|=========|
6|===   ===|
:alt 6 8 800 HAZARD PATH
8|<<<   =x=|
4|===   x=x|
6|===   =o=|
4|===   x=x|
:altend
4|=========|
2|CCCCCCCCC|
6|  =====  |
2|         |
6|=== = ===|
2|         |
4|===   ===|
4|=b=   =b=|
4|=b=   =b=|
4|===   ===|
2|         |
4|  =====  |
2|CCCCCCCCC|
6|=========|
:alt 0 1 800 SKY STEPS
4|==  ===  |
3|    ===  |
2|==  <<<  |
4|    ===  |
2|==       |
4|o=  ===  |
:altend
4|=========|
2|CCCCCCCCC|
4|  =====  |
6|  %%%%%  |
2|         |
6|  =x=x=  |
2|         |
6|  %%%%%  |
4|  =====  |
2|CCCCCCCCC|
:hint Three roads: ice, plasma or the long way round
8|=========|
:alt 6 8 900 PLASMA ALLEY
3|===  ===x|
6|===  ~~~x|
6|===  ~~~=|
8|===  <<<x|
4|===  ===o|
8|===  ~~~x|
:altend
4|=========|
2|CCCCCCCCC|
6|  =====  |
3|         |
4|  ==  =  |
3|         |
4|  =  ==  |
3|         |
6|  =====  |
2|CCCCCCCCC|
8|=========|
:obs 4 3.5 2.4 1.5 2
6|=========|
4|===###===|
4|=========|
4|##=====##|
4|=========|
3|FFFFFFFFF|
6|=========|
`;

const L9 = `
6|=======|
:hint Ramps lift the road. Drop-offs fall away — keep your line
4|  ===  |
1|  ///  |
@1
6|  ===  |
1|  ///  |
@2
6|  ===  |
@0
:hint Big drop ahead — hold steady and land it
8|  ===  |
2|CCCCCCC|
6|  ===  |
1|  ///  |
@1
4|  ===  |
1|  ///  |
@2
4|  ===  |
1|  ///  |
@3
6|  ===  |
2|       |
@1
8|  ===  |
@0
8|  ===  |
2|CCCCCCC|
:hint Climb the staircase: jump from block to block
4|  ===  |
3|  bbb  |
@1
3|  ===  |
3|  bbb  |
@2
3|  ===  |
3|  bbb  |
@3
6|  ===  |
2|CCCCCCC|
@3
4|  ===  |
1|  vvv  |
@2
4|  ===  |
1|  vvv  |
@1
4|  ===  |
1|  vvv  |
@0
6|  ===  |
:hint Launch up to the high road
4|  ===  |
1|  ^^^  |
@3
3|       |
12|  ===  |
2|CCCCCCC|
@3
4|  ===  |
2|       |
@0
4|  ===  |
@-2
6|  ===  |
2|       |
@-2
8|  =o=  |
2|CCCCCCC|
:hint Switchbacks in the sky — up, over and down
4|  ===  |
1|  ///  |
@-1
4|  ===  |
2|       |
@-1
4|   === |
1|   /// |
@0
4|   === |
2|       |
@0
4|  ===  |
1|  ///  |
@1
6|  ===  |
@-1
6|  ===  |
2|CCCCCCC|
@-1
4|  ===  |
1|  ^^^  |
@2
3|       |
8| ===== |
2|       |
@0
6| ===== |
@-2
6| =o=o= |
@-4
8|  ===  |
3|FFFFFFF|
6|=======|
`;

const L10 = `
8|=========|
:hint Final approach. Everything you have learned — go!
6|  >>>>>  |
4|  =====  |
4|         |
6|  =====  |
4|  x===x  |
6|  ~~~~~  |
4|  =====  |
2|CCCCCCCCC|
6|  %%%%%  |
2|         |
4|  %%%%%  |
4|  =====  |
1|  ^^^^^  |
@2
4|         |
10|  =====  |
2|CCCCCCCCC|
@2
6|=========|
:obs 4 3 2.0 1.5 2
8|=========|
4|==x===x==|
4|=========|
:alt 0 1 900 THE EDGE
6|~~  =====|
6|o~  <<<<<|
6|~~  =====|
:altend
4|=========|
2|CCCCCCCCC|
@2
4|  =====  |
1|  vvvvv  |
@1
4|  =====  |
1|  vvvvv  |
@0
6|  !!!!!  |
6|  =====  |
5|         |
6|  =o=o=  |
2|CCCCCCCCC|
6|  ~~~~~  |
4|  ~#~#~  |
6|  ~~~~~  |
2|         |
6|  %%%%%  |
4|  bbbbb  |
4|  =====  |
2|CCCCCCCCC|
:obs 4 2.5 1.6 1.5 2
8|  =====  |
6|  xx=xx  |
4|  =====  |
2|         |
4|  =====  |
4|   >>>   |
6|         |
6|  =====  |
2|CCCCCCCCC|
:hint Last stretch. Hold your nerve
4|  =====  |
4|  x===x  |
4|  =x=x=  |
4|  =====  |
2|         |
4|  %%%%%  |
2|         |
4|  bbbbb  |
4|  =====  |
:obs 4 2.5 1.4 1.5 2
8|=========|
4|##=====##|
6|  ~~~~~  |
4|  =====  |
1|  ^^^^^  |
@2
4|         |
8|  =====  |
2|         |
@0
6|  =====  |
4|  >>>>>  |
5|         |
6|  =====  |
3|FFFFFFFFF|
6|=========|
`;

export const CAMPAIGN: LevelDef[] = [
  { id: 1, name: 'First Flight', tagline: 'Learn to steer, jump and stay alive.', theme: 'dawn', width: 7, layout: L1, medals: { gold: 29, silver: 42 }, lives: 5, bpm: 112 },
  { id: 2, name: 'The Gap', tagline: 'Longer jumps, raised blocks and walls.', theme: 'rift', width: 7, layout: L2, medals: { gold: 38, silver: 51 }, lives: 5, bpm: 116 },
  { id: 3, name: 'Thermal Run', tagline: 'Accelerators, drag plates and boost strips.', theme: 'thermal', width: 7, layout: L3, medals: { gold: 27, silver: 38 }, lives: 4, bpm: 120 },
  { id: 4, name: 'Frozen Orbit', tagline: 'Ice. Steer early, steer gently.', theme: 'frost', width: 7, layout: L4, medals: { gold: 34, silver: 46 }, lives: 4, bpm: 118 },
  { id: 5, name: 'Vanishing Road', tagline: 'The road collapses behind you.', theme: 'vanish', width: 7, layout: L5, medals: { gold: 25, silver: 38 }, lives: 4, bpm: 122 },
  { id: 6, name: 'Hazard Sector', tagline: 'Plasma tiles and sliding blocks.', theme: 'hazard', width: 9, layout: L6, medals: { gold: 32, silver: 44 }, lives: 4, bpm: 126 },
  { id: 7, name: 'Speed Trial', tagline: 'Precision at full throttle.', theme: 'speed', width: 7, layout: L7, medals: { gold: 28, silver: 38 }, lives: 4, bpm: 132 },
  { id: 8, name: 'Broken Circuit', tagline: 'Pick your route through a shattered track.', theme: 'broken', width: 9, layout: L8, medals: { gold: 25, silver: 37 }, lives: 4, bpm: 128 },
  { id: 9, name: 'Orbital Descent', tagline: 'Ramps, drops and a road in the sky.', theme: 'descent', width: 7, layout: L9, medals: { gold: 28, silver: 38 }, lives: 4, bpm: 124 },
  { id: 10, name: 'Final Approach', tagline: 'Every hazard. One run.', theme: 'final', width: 9, layout: L10, medals: { gold: 29, silver: 46 }, lives: 3, bpm: 136 },
];
