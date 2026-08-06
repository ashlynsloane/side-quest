import type { EquipmentId, Exercise, MovementPattern } from '@circuit/domain';
import { StyleSheet, Text, View } from 'react-native';

type Stage = 'setup' | 'move' | 'finish';
type Point = { x: number; y: number };
type Pose = {
  head: Point;
  neck: Point;
  shoulderLeft: Point;
  shoulderRight: Point;
  elbowLeft: Point;
  elbowRight: Point;
  handLeft: Point;
  handRight: Point;
  hipLeft: Point;
  hipRight: Point;
  kneeLeft: Point;
  kneeRight: Point;
  ankleLeft: Point;
  ankleRight: Point;
  arrow?: string;
};

const WIDTH = 150;
const HEIGHT = 154;

export function ExerciseBodyFigure({
  exercise,
  stage,
}: {
  exercise: Exercise;
  stage: Stage;
}) {
  const pattern = exercise.movementPatterns[0] ?? 'mobility';
  const pose = poseFor(pattern, stage);
  const equipment = primaryEquipment(exercise);

  return (
    <View
      style={styles.canvas}
      accessibilityRole="image"
      accessibilityLabel={`${exercise.name}, ${stage} position`}
    >
      <View style={styles.floor} />
      <View style={[styles.torsoSilhouette, { left: midpoint(pose.shoulderLeft, pose.shoulderRight).x - 19, top: midpoint(pose.shoulderLeft, pose.shoulderRight).y - 4 }]} />
      <View style={[styles.pelvisSilhouette, { left: midpoint(pose.hipLeft, pose.hipRight).x - 16, top: midpoint(pose.hipLeft, pose.hipRight).y - 5 }]} />

      <Line from={pose.neck} to={midpoint(pose.hipLeft, pose.hipRight)} thickness={12} tone="torso" />
      <Line from={pose.shoulderLeft} to={pose.shoulderRight} thickness={8} tone="torso" />
      <Line from={pose.hipLeft} to={pose.hipRight} thickness={9} tone="torso" />

      <Line from={pose.shoulderLeft} to={pose.elbowLeft} thickness={7} />
      <Line from={pose.elbowLeft} to={pose.handLeft} thickness={6} />
      <Line from={pose.shoulderRight} to={pose.elbowRight} thickness={7} />
      <Line from={pose.elbowRight} to={pose.handRight} thickness={6} />

      <Line from={pose.hipLeft} to={pose.kneeLeft} thickness={9} />
      <Line from={pose.kneeLeft} to={pose.ankleLeft} thickness={8} />
      <Line from={pose.hipRight} to={pose.kneeRight} thickness={9} />
      <Line from={pose.kneeRight} to={pose.ankleRight} thickness={8} />

      <Joint point={pose.shoulderLeft} />
      <Joint point={pose.shoulderRight} />
      <Joint point={pose.elbowLeft} small />
      <Joint point={pose.elbowRight} small />
      <Joint point={pose.hipLeft} />
      <Joint point={pose.hipRight} />
      <Joint point={pose.kneeLeft} small />
      <Joint point={pose.kneeRight} small />

      <View
        style={[
          styles.head,
          { left: pose.head.x - 13, top: pose.head.y - 13 },
        ]}
      >
        <View style={styles.faceMark} />
      </View>

      <View style={[styles.foot, footStyle(pose.ankleLeft, true)]} />
      <View style={[styles.foot, footStyle(pose.ankleRight, false)]} />

      <EquipmentOverlay equipment={equipment} pose={pose} />

      {pose.arrow ? (
        <View style={styles.arrowBadge}>
          <Text style={styles.arrowText}>{pose.arrow}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Line({
  from,
  to,
  thickness,
  tone = 'limb',
}: {
  from: Point;
  to: Point;
  thickness: number;
  tone?: 'limb' | 'torso';
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const centerX = (from.x + to.x) / 2;
  const centerY = (from.y + to.y) / 2;
  return (
    <View
      style={[
        styles.line,
        tone === 'torso' && styles.torsoLine,
        {
          width: length,
          height: thickness,
          left: centerX - length / 2,
          top: centerY - thickness / 2,
          borderRadius: thickness / 2,
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    />
  );
}

function Joint({ point, small = false }: { point: Point; small?: boolean }) {
  const size = small ? 7 : 9;
  return (
    <View
      style={[
        styles.joint,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: point.x - size / 2,
          top: point.y - size / 2,
        },
      ]}
    />
  );
}

function EquipmentOverlay({ equipment, pose }: { equipment: EquipmentId; pose: Pose }) {
  if (equipment === 'dumbbell' || equipment === 'kettlebell' || equipment === 'medicine_ball') {
    return (
      <>
        <View style={[styles.weight, { left: pose.handLeft.x - 6, top: pose.handLeft.y - 6 }]} />
        <View style={[styles.weight, { left: pose.handRight.x - 6, top: pose.handRight.y - 6 }]} />
      </>
    );
  }
  if (equipment === 'barbell' || equipment === 'trap_bar' || equipment === 'weight_plate') {
    const y = Math.min(pose.handLeft.y, pose.handRight.y) - 2;
    const left = Math.min(pose.handLeft.x, pose.handRight.x) - 16;
    const right = Math.max(pose.handLeft.x, pose.handRight.x) + 16;
    return (
      <>
        <View style={[styles.bar, { left, top: y, width: right - left }]} />
        <View style={[styles.plate, { left: left - 2, top: y - 8 }]} />
        <View style={[styles.plate, { left: right - 4, top: y - 8 }]} />
      </>
    );
  }
  if (equipment === 'long_band' || equipment === 'mini_band') {
    return (
      <View
        style={[
          styles.band,
          {
            left: Math.min(pose.kneeLeft.x, pose.kneeRight.x) - 4,
            top: Math.min(pose.kneeLeft.y, pose.kneeRight.y) - 3,
            width: Math.abs(pose.kneeRight.x - pose.kneeLeft.x) + 8,
          },
        ]}
      />
    );
  }
  if (equipment === 'bench' || equipment === 'box') {
    return <View style={styles.bench} />;
  }
  if (equipment === 'pullup_bar') {
    return <View style={styles.pullupBar} />;
  }
  return null;
}

function primaryEquipment(exercise: Exercise): EquipmentId {
  const options = exercise.equipmentOptions.flatMap((option) => option.items);
  return options.find((item) => item.equipmentId !== 'bodyweight')?.equipmentId ?? 'bodyweight';
}

function poseFor(pattern: MovementPattern, stage: Stage): Pose {
  const standing = baseStanding();
  if (stage === 'setup') return setupPose(pattern, standing);
  if (stage === 'finish') return finishPose(pattern, standing);
  return movementPose(pattern, standing);
}

function setupPose(pattern: MovementPattern, standing: Pose): Pose {
  if (pattern === 'horizontal_push' || pattern === 'anti_extension') return plankPose('setup');
  if (pattern === 'vertical_pull') return hangPose(false);
  if (pattern === 'trunk_flexion') return floorPose(false);
  if (pattern === 'mobility') return mobilityPose(false);
  return standing;
}

function finishPose(pattern: MovementPattern, standing: Pose): Pose {
  if (pattern === 'horizontal_push' || pattern === 'anti_extension') return plankPose('finish');
  if (pattern === 'vertical_pull') return hangPose(false);
  if (pattern === 'trunk_flexion') return floorPose(false);
  if (pattern === 'rotation') return rotationPose('right');
  if (pattern === 'mobility') return mobilityPose(false);
  return standing;
}

function movementPose(pattern: MovementPattern, standing: Pose): Pose {
  switch (pattern) {
    case 'squat': return squatPose();
    case 'lunge': return lungePose();
    case 'hinge': return hingePose();
    case 'horizontal_push': return plankPose('move');
    case 'vertical_push': return overheadPose();
    case 'horizontal_pull': return rowPose();
    case 'vertical_pull': return hangPose(true);
    case 'carry': return carryPose();
    case 'rotation': return rotationPose('left');
    case 'anti_rotation': return antiRotationPose();
    case 'trunk_flexion': return floorPose(true);
    case 'anti_extension': return plankPose('move');
    case 'lateral_flexion': return sideBendPose();
    case 'jump_hop': return jumpPose();
    case 'balance': return balancePose();
    case 'locomotion': return runPose();
    case 'mobility': return mobilityPose(true);
    default: return { ...standing, arrow: '↕' };
  }
}

function baseStanding(): Pose {
  return {
    head: p(75, 23), neck: p(75, 40),
    shoulderLeft: p(58, 45), shoulderRight: p(92, 45),
    elbowLeft: p(49, 71), elbowRight: p(101, 71),
    handLeft: p(47, 96), handRight: p(103, 96),
    hipLeft: p(66, 91), hipRight: p(84, 91),
    kneeLeft: p(62, 120), kneeRight: p(88, 120),
    ankleLeft: p(58, 146), ankleRight: p(92, 146),
  };
}

function squatPose(): Pose {
  return {
    head: p(75, 30), neck: p(75, 47),
    shoulderLeft: p(58, 51), shoulderRight: p(92, 51),
    elbowLeft: p(48, 70), elbowRight: p(102, 70),
    handLeft: p(62, 82), handRight: p(88, 82),
    hipLeft: p(61, 90), hipRight: p(89, 90),
    kneeLeft: p(45, 116), kneeRight: p(105, 116),
    ankleLeft: p(54, 145), ankleRight: p(96, 145),
    arrow: '↓',
  };
}

function lungePose(): Pose {
  return {
    head: p(74, 26), neck: p(74, 43),
    shoulderLeft: p(57, 48), shoulderRight: p(91, 48),
    elbowLeft: p(48, 72), elbowRight: p(100, 72),
    handLeft: p(47, 98), handRight: p(101, 98),
    hipLeft: p(64, 91), hipRight: p(82, 91),
    kneeLeft: p(47, 118), kneeRight: p(107, 117),
    ankleLeft: p(32, 145), ankleRight: p(108, 145),
    arrow: '↓',
  };
}

function hingePose(): Pose {
  return {
    head: p(101, 45), neck: p(87, 53),
    shoulderLeft: p(77, 49), shoulderRight: p(91, 59),
    elbowLeft: p(80, 78), elbowRight: p(96, 85),
    handLeft: p(74, 105), handRight: p(91, 110),
    hipLeft: p(62, 88), hipRight: p(78, 94),
    kneeLeft: p(61, 119), kneeRight: p(83, 121),
    ankleLeft: p(58, 146), ankleRight: p(90, 146),
    arrow: '↘',
  };
}

function overheadPose(): Pose {
  return {
    ...baseStanding(),
    elbowLeft: p(54, 24), elbowRight: p(96, 24),
    handLeft: p(64, 5), handRight: p(86, 5),
    arrow: '↑',
  };
}

function rowPose(): Pose {
  const pose = hingePose();
  return {
    ...pose,
    elbowLeft: p(58, 62), elbowRight: p(73, 71),
    handLeft: p(79, 81), handRight: p(93, 88),
    arrow: '←',
  };
}

function hangPose(pulled: boolean): Pose {
  return {
    head: p(75, pulled ? 51 : 65), neck: p(75, pulled ? 66 : 80),
    shoulderLeft: p(58, pulled ? 69 : 83), shoulderRight: p(92, pulled ? 69 : 83),
    elbowLeft: p(49, pulled ? 43 : 49), elbowRight: p(101, pulled ? 43 : 49),
    handLeft: p(45, 19), handRight: p(105, 19),
    hipLeft: p(66, pulled ? 106 : 119), hipRight: p(84, pulled ? 106 : 119),
    kneeLeft: p(64, pulled ? 130 : 137), kneeRight: p(86, pulled ? 130 : 137),
    ankleLeft: p(62, 150), ankleRight: p(88, 150),
    arrow: pulled ? '↑' : undefined,
  };
}

function plankPose(stage: 'setup' | 'move' | 'finish'): Pose {
  const lower = stage === 'move';
  return {
    head: p(34, lower ? 83 : 66), neck: p(47, lower ? 86 : 70),
    shoulderLeft: p(49, lower ? 79 : 64), shoulderRight: p(56, lower ? 92 : 77),
    elbowLeft: p(42, lower ? 105 : 99), elbowRight: p(55, lower ? 111 : 105),
    handLeft: p(30, 127), handRight: p(48, 131),
    hipLeft: p(92, lower ? 91 : 83), hipRight: p(98, lower ? 103 : 95),
    kneeLeft: p(115, lower ? 104 : 96), kneeRight: p(120, lower ? 116 : 108),
    ankleLeft: p(137, lower ? 115 : 108), ankleRight: p(140, lower ? 126 : 119),
    arrow: lower ? '↓' : undefined,
  };
}

function carryPose(): Pose {
  const pose = baseStanding();
  return {
    ...pose,
    elbowLeft: p(58, 71), elbowRight: p(92, 71),
    handLeft: p(58, 101), handRight: p(92, 101),
    arrow: '→',
  };
}

function rotationPose(direction: 'left' | 'right'): Pose {
  const pose = baseStanding();
  const shift = direction === 'left' ? -15 : 15;
  return {
    ...pose,
    elbowLeft: p(55 + shift, 69), elbowRight: p(95 + shift, 69),
    handLeft: p(67 + shift, 78), handRight: p(83 + shift, 78),
    arrow: direction === 'left' ? '↶' : '↷',
  };
}

function antiRotationPose(): Pose {
  const pose = baseStanding();
  return {
    ...pose,
    elbowLeft: p(66, 63), elbowRight: p(84, 63),
    handLeft: p(57, 63), handRight: p(93, 63),
    arrow: '⇆',
  };
}

function floorPose(crunched: boolean): Pose {
  return {
    head: p(crunched ? 58 : 35, crunched ? 86 : 111),
    neck: p(crunched ? 68 : 49, crunched ? 94 : 111),
    shoulderLeft: p(crunched ? 66 : 50, crunched ? 90 : 104),
    shoulderRight: p(crunched ? 72 : 53, crunched ? 100 : 116),
    elbowLeft: p(crunched ? 54 : 36, crunched ? 73 : 91),
    elbowRight: p(crunched ? 61 : 39, crunched ? 82 : 121),
    handLeft: p(crunched ? 45 : 27, crunched ? 62 : 80),
    handRight: p(crunched ? 52 : 30, crunched ? 72 : 132),
    hipLeft: p(91, 112), hipRight: p(96, 123),
    kneeLeft: p(116, 92), kneeRight: p(122, 105),
    ankleLeft: p(136, 118), ankleRight: p(140, 130),
    arrow: crunched ? '↗' : undefined,
  };
}

function sideBendPose(): Pose {
  const pose = baseStanding();
  return {
    ...pose,
    head: p(91, 28), neck: p(87, 44),
    shoulderLeft: p(68, 44), shoulderRight: p(100, 52),
    elbowLeft: p(56, 66), elbowRight: p(105, 78),
    handLeft: p(50, 91), handRight: p(105, 104),
    arrow: '↘',
  };
}

function jumpPose(): Pose {
  return {
    head: p(75, 17), neck: p(75, 34),
    shoulderLeft: p(57, 40), shoulderRight: p(93, 40),
    elbowLeft: p(43, 24), elbowRight: p(107, 24),
    handLeft: p(33, 8), handRight: p(117, 8),
    hipLeft: p(66, 84), hipRight: p(84, 84),
    kneeLeft: p(55, 109), kneeRight: p(95, 109),
    ankleLeft: p(45, 127), ankleRight: p(105, 127),
    arrow: '↑',
  };
}

function balancePose(): Pose {
  const pose = baseStanding();
  return {
    ...pose,
    kneeRight: p(105, 112), ankleRight: p(99, 88),
    arrow: '↔',
  };
}

function runPose(): Pose {
  return {
    head: p(80, 23), neck: p(76, 40),
    shoulderLeft: p(59, 46), shoulderRight: p(92, 43),
    elbowLeft: p(45, 64), elbowRight: p(105, 61),
    handLeft: p(57, 78), handRight: p(91, 78),
    hipLeft: p(66, 91), hipRight: p(84, 88),
    kneeLeft: p(48, 115), kneeRight: p(104, 111),
    ankleLeft: p(33, 143), ankleRight: p(118, 132),
    arrow: '→',
  };
}

function mobilityPose(active: boolean): Pose {
  const pose = baseStanding();
  return {
    ...pose,
    elbowLeft: p(active ? 38 : 50, active ? 35 : 69),
    handLeft: p(active ? 25 : 47, active ? 15 : 94),
    elbowRight: p(active ? 112 : 100, active ? 35 : 69),
    handRight: p(active ? 125 : 103, active ? 15 : 94),
    arrow: active ? '↔' : undefined,
  };
}

function footStyle(point: Point, left: boolean) {
  return {
    left: point.x - (left ? 13 : 3),
    top: point.y - 2,
    transform: [{ rotate: left ? '-4deg' : '4deg' }],
  } as const;
}

function midpoint(left: Point, right: Point): Point {
  return p((left.x + right.x) / 2, (left.y + right.y) / 2);
}
function p(x: number, y: number): Point { return { x, y }; }

const styles = StyleSheet.create({
  canvas: {
    width: WIDTH,
    height: HEIGHT,
    position: 'relative',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  floor: {
    position: 'absolute',
    left: 13,
    right: 13,
    bottom: 3,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#B8C7BD',
  },
  line: { position: 'absolute', backgroundColor: '#315544' },
  torsoLine: { backgroundColor: '#173A2B' },
  joint: { position: 'absolute', backgroundColor: '#254B38' },
  head: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E7B99A',
    borderWidth: 2,
    borderColor: '#173A2B',
  },
  faceMark: {
    position: 'absolute',
    right: 4,
    top: 9,
    width: 4,
    height: 2,
    borderRadius: 2,
    backgroundColor: '#173A2B',
  },
  foot: {
    position: 'absolute',
    width: 16,
    height: 6,
    borderRadius: 4,
    backgroundColor: '#173A2B',
  },
  weight: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: '#5E6D65',
    borderWidth: 2,
    borderColor: '#173A2B',
  },
  bar: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4D5C54',
  },
  plate: {
    position: 'absolute',
    width: 6,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#173A2B',
  },
  band: {
    position: 'absolute',
    height: 7,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#9A5C31',
  },
  bench: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    width: 110,
    height: 13,
    borderRadius: 5,
    backgroundColor: '#7D8C84',
  },
  pullupBar: {
    position: 'absolute',
    left: 30,
    top: 17,
    width: 90,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4D5C54',
  },
  arrowBadge: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFFCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { color: '#173A2B', fontSize: 22, fontWeight: '800' },
  torsoSilhouette: { position: 'absolute', width: 38, height: 48, borderRadius: 17, backgroundColor: '#5E806C', opacity: 0.32 },
  pelvisSilhouette: { position: 'absolute', width: 32, height: 22, borderRadius: 11, backgroundColor: '#315D46', opacity: 0.28 },
});
