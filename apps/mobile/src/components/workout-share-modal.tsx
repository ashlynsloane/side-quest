import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DEFAULT_WORKOUT_SHARE_OPTIONS, shareCompletedWorkout, type CompletedWorkoutSummary, type WorkoutShareOptions } from '@/services/workout-summary';
import { useTheme } from '@/state/theme-context';

export function WorkoutShareModal({ summary, visible, onClose }: { summary: CompletedWorkoutSummary; visible: boolean; onClose: () => void }) {
  const { tokens } = useTheme();
  const [options, setOptions] = useState<WorkoutShareOptions>(DEFAULT_WORKOUT_SHARE_OPTIONS);
  const [busy, setBusy] = useState(false);
  function patch(key: keyof WorkoutShareOptions, value: boolean) { setOptions((current) => ({ ...current, [key]: value })); }
  async function share() { setBusy(true); try { await shareCompletedWorkout(summary, options); } finally { setBusy(false); } }
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={[styles.sheet, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
    <View style={styles.header}><View style={{ flex:1 }}><Text style={[styles.eyebrow,{color:tokens.accent}]}>SHARE WORKOUT</Text><Text style={[styles.title,{color:tokens.text}]}>{summary.name}</Text><Text style={[styles.helper,{color:tokens.textMuted}]}>Symptoms, restrictions, notes, and detailed loads stay private unless you explicitly include them.</Text></View><Pressable onPress={onClose}><Text style={[styles.close,{color:tokens.accent}]}>Done</Text></Pressable></View>
    <Toggle label="Duration and rounds" value={options.includeDuration} onChange={(value)=>patch('includeDuration',value)} tokens={tokens}/>
    <Toggle label="Body areas trained" value={options.includeTrainedAreas} onChange={(value)=>patch('includeTrainedAreas',value)} tokens={tokens}/>
    <Toggle label="Exercise categories" value={options.includeCategories} onChange={(value)=>patch('includeCategories',value)} tokens={tokens}/>
    <Toggle label="Exercise list" value={options.includeExerciseList} onChange={(value)=>patch('includeExerciseList',value)} tokens={tokens}/>
    <Toggle label="Reps / seconds" value={options.includeReps} onChange={(value)=>patch('includeReps',value)} tokens={tokens}/>
    <Toggle label="Weights" value={options.includeLoads} onChange={(value)=>patch('includeLoads',value)} tokens={tokens}/>
    <Pressable disabled={busy} onPress={()=>void share()} style={[styles.share,{backgroundColor:tokens.accentStrong},busy&&styles.disabled]}><Text style={styles.shareText}>{busy?'Preparing…':'Open share sheet'}</Text></Pressable>
  </View></View></Modal>;
}
function Toggle({label,value,onChange,tokens}:{label:string;value:boolean;onChange:(value:boolean)=>void;tokens:ReturnType<typeof useTheme>['tokens']}){return <View style={[styles.row,{borderBottomColor:tokens.border}]}><Text style={[styles.rowText,{color:tokens.text}]}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{false:tokens.border,true:tokens.accentSoft}} thumbColor={value?tokens.accent:tokens.surface}/></View>}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(3,18,36,.4)',justifyContent:'flex-end'},sheet:{borderWidth:1,borderTopLeftRadius:28,borderTopRightRadius:28,padding:20,paddingBottom:34},header:{flexDirection:'row',gap:12,marginBottom:8},eyebrow:{fontSize:10.5,fontWeight:'900',letterSpacing:1.2},title:{fontSize:22,lineHeight:27,fontWeight:'800',marginTop:3},helper:{fontSize:12.5,lineHeight:17,marginTop:4},close:{fontSize:13,fontWeight:'800'},row:{minHeight:50,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:StyleSheet.hairlineWidth},rowText:{fontSize:15,fontWeight:'700'},share:{minHeight:52,borderRadius:17,alignItems:'center',justifyContent:'center',marginTop:16},shareText:{color:'#fff',fontSize:15,fontWeight:'900'},disabled:{opacity:.5}});
