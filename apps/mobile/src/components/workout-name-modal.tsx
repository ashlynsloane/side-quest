import type { GeneratedWorkout } from '@circuit/domain';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { generateWorkoutNameCandidates } from '@/services/workout-identity';
import { useTheme } from '@/state/theme-context';

export function WorkoutNameModal({ workout, visible, onClose, onSave }: { workout: GeneratedWorkout; visible: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const { tokens } = useTheme();
  const [name, setName] = useState(workout.name);
  const [suggestions, setSuggestions] = useState(() => generateWorkoutNameCandidates(workout));
  useEffect(() => { if (visible) { setName(workout.name); setSuggestions(generateWorkoutNameCandidates(workout)); } }, [visible, workout]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: tokens.accent }]}>WORKOUT NAME</Text><Text style={[styles.title, { color: tokens.text }]}>Make it easy to remember</Text></View><Pressable onPress={onClose}><Text style={[styles.close, { color: tokens.accent }]}>Cancel</Text></Pressable></View>
    <TextInput value={name} onChangeText={setName} maxLength={48} autoFocus selectTextOnFocus returnKeyType="done" style={[styles.input, { color: tokens.text, borderColor: tokens.borderStrong, backgroundColor: tokens.canvas }]} />
    <Text style={[styles.helper, { color: tokens.textMuted }]}>Pick a suggestion or write your own. The name stays with favorites, history, and shared summaries.</Text>
    <View style={styles.suggestions}>{suggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => setName(suggestion)} style={[styles.suggestion, { backgroundColor: tokens.accentSoft, borderColor: tokens.border }]}><Text style={[styles.suggestionText, { color: tokens.accent }]}>{suggestion}</Text></Pressable>)}</View>
    <Pressable disabled={!name.trim()} onPress={() => onSave(name.trim())} style={[styles.save, { backgroundColor: tokens.accentStrong }, !name.trim() && styles.disabled]}><Text style={styles.saveText}>Use this name</Text></Pressable>
  </View></View></Modal>;
}
const styles = StyleSheet.create({ overlay:{flex:1,backgroundColor:'rgba(3,18,36,0.45)',justifyContent:'center',padding:22},card:{borderWidth:1,borderRadius:24,padding:18,gap:13},header:{flexDirection:'row',gap:12},eyebrow:{fontSize:10.5,fontWeight:'900',letterSpacing:1.2},title:{fontSize:21,lineHeight:26,fontWeight:'800',marginTop:3},close:{fontSize:13,fontWeight:'800'},input:{minHeight:52,borderWidth:1,borderRadius:15,paddingHorizontal:14,fontSize:17,fontWeight:'800'},helper:{fontSize:13,lineHeight:18},suggestions:{gap:8},suggestion:{borderWidth:1,borderRadius:14,paddingHorizontal:12,paddingVertical:10},suggestionText:{fontSize:14,fontWeight:'800'},save:{minHeight:50,borderRadius:16,alignItems:'center',justifyContent:'center'},saveText:{color:'#fff',fontSize:15,fontWeight:'900'},disabled:{opacity:.45} });
