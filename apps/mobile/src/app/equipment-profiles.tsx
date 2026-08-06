import type { EquipmentId } from '@circuit/domain';
import { equipmentSeed } from '@circuit/exercise-content';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { deleteEquipmentProfile, ensureDefaultEquipmentProfiles, saveEquipmentProfile, type EquipmentProfile } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { radius, typography, type AppPalette } from '@/theme';

const GROUPS: Array<{ title: string; ids: EquipmentId[] }> = [
  { title: 'Bands + portable tools', ids: ['long_band','mini_band','slider','trx','pullup_bar'] },
  { title: 'Free weights', ids: ['dumbbell','kettlebell','barbell','weight_plate','trap_bar','medicine_ball'] },
  { title: 'Balance + surfaces', ids: ['bosu','stability_ball','bench','box','wall','stairs'] },
  { title: 'Gym machines', ids: ['cable_machine','leg_press'] },
];

export default function EquipmentProfilesScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [profiles, setProfiles] = useState<EquipmentProfile[]>([]);
  const [editing, setEditing] = useState<EquipmentProfile | null>(null);
  const load = useCallback(async () => setProfiles(await ensureDefaultEquipmentProfiles()), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <AppScreen eyebrow="TRAINING LOCATIONS" title="Save each equipment setup once" subtitle="Choose Home Gym, Work Gym, Full Gym, or a temporary setup when generating a workout. Available loads are saved so progression recommendations use weights you actually own.">
    {profiles.map((profile) => <Pressable key={profile.id} onPress={() => setEditing(profile)} style={({pressed}) => [styles.profile, pressed && styles.pressed]}>
      <View style={styles.profileTop}><View style={{flex:1}}><Text style={styles.profileName}>{profile.name}</Text><Text style={styles.meta}>{profile.equipment.length} equipment types · {profile.kind.replaceAll('_',' ')}</Text></View>{profile.isDefault ? <Pill tone="good">Default</Pill> : null}<Text style={styles.chevron}>›</Text></View>
      <View style={styles.chips}>{profile.equipment.slice(0,8).map((id)=><View key={id} style={styles.miniChip}><Text style={styles.miniChipText}>{label(id)}</Text></View>)}{profile.equipment.length>8?<Text style={styles.more}>+{profile.equipment.length-8}</Text>:null}</View>
      {profile.dumbbellLoads?.length ? <Text style={styles.loads}>Dumbbells: {profile.dumbbellLoads.join(', ')} {profile.loadUnit ?? 'lb'}</Text> : null}
    </Pressable>)}
    <Pressable onPress={() => setEditing(blankProfile())} style={styles.add}><Text style={styles.addText}>＋ Add another location</Text></Pressable>

    <Modal visible={Boolean(editing)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
      <SafeAreaView style={styles.modalSafe}>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {editing ? <ProfileEditor profile={editing} onClose={() => setEditing(null)} onSaved={async()=>{setEditing(null);await load();}} onDelete={async()=>{await deleteEquipmentProfile(editing.id);setEditing(null);await load();}}/> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </AppScreen>;
}

function ProfileEditor({profile,onClose,onSaved,onDelete}:{profile:EquipmentProfile;onClose:()=>void;onSaved:()=>void|Promise<void>;onDelete:()=>void|Promise<void>}) {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [name,setName]=useState(profile.name);
  const [equipment,setEquipment]=useState<EquipmentId[]>(profile.equipment);
  const [dbLoads,setDbLoads]=useState((profile.dumbbellLoads??[]).join(', '));
  const [kbLoads,setKbLoads]=useState((profile.kettlebellLoads??[]).join(', '));
  const [mbLoads,setMbLoads]=useState((profile.medicineBallLoads??[]).join(', '));
  const [plateLoads,setPlateLoads]=useState((profile.barbellPlateLoads??[]).join(', '));
  const [bandDetails,setBandDetails]=useState(profile.bandDetails??'');
  const [loadUnit,setLoadUnit]=useState<'lb'|'kg'>(profile.loadUnit??'lb');
  const [notes,setNotes]=useState(profile.notes??'');
  const [isDefault,setDefault]=useState(profile.isDefault);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function save(){
    if(saving)return;
    setSaving(true);setError(null);
    try{
      const now=new Date().toISOString();
      await saveEquipmentProfile({...profile,name:name.trim()||'Training location',equipment:unique(['bodyweight',...equipment]),dumbbellLoads:parseLoads(dbLoads),kettlebellLoads:parseLoads(kbLoads),medicineBallLoads:parseLoads(mbLoads),barbellPlateLoads:parseLoads(plateLoads),loadUnit,bandDetails:bandDetails.trim()||undefined,notes:notes.trim()||undefined,isDefault,updatedAt:now,createdAt:profile.createdAt||now});
      await onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:'This location could not be saved.');}
    finally{setSaving(false);}
  }
  return <Surface style={styles.editor}>
    <View style={styles.editorTop}><Text style={styles.editorTitle}>Edit equipment profile</Text><Pressable onPress={onClose}><Text style={styles.close}>Close</Text></Pressable></View>
    <Text style={styles.label}>Location name</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={palette.inkMuted}/>
    <Pressable onPress={()=>setDefault(v=>!v)} style={[styles.defaultRow,isDefault&&styles.defaultActive]}><Text style={[styles.defaultText,isDefault&&styles.defaultTextActive]}>{isDefault?'✓ Default workout location':'Make this my default location'}</Text></Pressable>
    {GROUPS.map((group)=><View key={group.title} style={styles.group}><Text style={styles.groupTitle}>{group.title}</Text><View style={styles.chips}>{group.ids.map((id)=>{const active=equipment.includes(id);return <Pressable key={id} onPress={()=>setEquipment(current=>active?current.filter(x=>x!==id):[...current,id])} style={[styles.choice,active&&styles.choiceActive]}><Text style={[styles.choiceText,active&&styles.choiceTextActive]}>{label(id)}</Text></Pressable>})}</View></View>)}
    <Text style={styles.label}>Weight unit</Text><View style={styles.unitRow}>{(['lb','kg'] as const).map(unit=><Pressable key={unit} onPress={()=>setLoadUnit(unit)} style={[styles.unitButton,loadUnit===unit&&styles.unitButtonActive]}><Text style={[styles.unitButtonText,loadUnit===unit&&styles.unitButtonTextActive]}>{unit}</Text></Pressable>)}</View>
    <Text style={styles.label}>Dumbbell weights available</Text><TextInput value={dbLoads} onChangeText={setDbLoads} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="7.5, 10, 15, 20" placeholderTextColor={palette.inkMuted}/>
    <Text style={styles.label}>Kettlebell weights available</Text><TextInput value={kbLoads} onChangeText={setKbLoads} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="30" placeholderTextColor={palette.inkMuted}/>
    <Text style={styles.label}>Medicine / slam ball weights</Text><TextInput value={mbLoads} onChangeText={setMbLoads} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="15, 25" placeholderTextColor={palette.inkMuted}/>
    <Text style={styles.label}>Barbell total loads or plate milestones</Text><TextInput value={plateLoads} onChangeText={setPlateLoads} style={styles.input} keyboardType="numbers-and-punctuation" placeholder="45, 55, 65, 75, 85" placeholderTextColor={palette.inkMuted}/>
    <Text style={styles.label}>Band details</Text><TextInput value={bandDetails} onChangeText={setBandDetails} style={styles.input} placeholder="Long bands: light/heavy; mini loops: 3 levels" placeholderTextColor={palette.inkMuted}/>
    <Text style={styles.label}>Other notes</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input,styles.multiline]} placeholder="Door anchor, low step height, temporary unavailable item…" placeholderTextColor={palette.inkMuted}/>
    {error?<View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>:null}
    <Pressable disabled={saving} onPress={()=>void save()} style={[styles.save,saving&&styles.disabled]}><Text style={styles.saveText}>{saving?'Saving…':'Save location'}</Text></Pressable>
    {!profile.id.startsWith('equipment_')||profile.kind==='custom'?<Pressable disabled={saving} onPress={()=>Alert.alert('Delete location?',`Delete ${profile.name}?`,[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void onDelete()}])} style={styles.delete}><Text style={styles.deleteText}>Delete location</Text></Pressable>:null}
  </Surface>;
}
function blankProfile():EquipmentProfile{const now=new Date().toISOString();return{id:`equipment_custom_${Date.now()}`,name:'New location',kind:'custom',equipment:['bodyweight'],loadUnit:'lb',isDefault:false,createdAt:now,updatedAt:now};}
function label(id:EquipmentId){return equipmentSeed.find((item)=>item.id===id)?.label??id;}
function unique<T>(items:T[]):T[]{return [...new Set(items)];}
function parseLoads(value:string){const values=unique(value.split(/[,\s]+/).map(Number).filter((item)=>Number.isFinite(item)&&item>0)).sort((a,b)=>a-b);return values.length?values:undefined;}
function makeStyles(palette:AppPalette){return StyleSheet.create({
modalSafe:{flex:1,backgroundColor:palette.canvas},modalContent:{padding:18,paddingBottom:40},errorBox:{backgroundColor:palette.surfaceMuted,borderRadius:12,padding:11},errorText:{color:palette.warning,fontSize:12,fontWeight:'800'},disabled:{opacity:.55},profile:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:radius.lg,padding:15,gap:10},pressed:{opacity:.7},profileTop:{flexDirection:'row',alignItems:'center',gap:8},profileName:{fontSize:18,fontWeight:'900',color:palette.ink},meta:{...typography.small,color:palette.inkMuted,textTransform:'capitalize'},chevron:{fontSize:26,color:palette.forest},chips:{flexDirection:'row',flexWrap:'wrap',gap:6},miniChip:{backgroundColor:palette.surfaceMuted,borderRadius:999,paddingHorizontal:8,paddingVertical:5},miniChipText:{fontSize:10,fontWeight:'800',color:palette.ink},more:{fontSize:11,fontWeight:'900',color:palette.forest,padding:5},loads:{...typography.small,color:palette.forest,fontWeight:'700'},add:{borderWidth:1,borderStyle:'dashed',borderColor:palette.forest,borderRadius:radius.lg,padding:15,alignItems:'center'},addText:{color:palette.forest,fontWeight:'900'},editor:{gap:12},editorTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},editorTitle:{fontSize:20,fontWeight:'900',color:palette.ink},close:{color:palette.forest,fontWeight:'900'},label:{...typography.eyebrow,color:palette.forest},input:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:radius.sm,padding:12,color:palette.ink},multiline:{minHeight:70,textAlignVertical:'top'},defaultRow:{borderWidth:1,borderColor:palette.border,borderRadius:12,padding:12},defaultActive:{backgroundColor:palette.forest,borderColor:palette.forest},defaultText:{fontWeight:'800',color:palette.ink},defaultTextActive:{color:palette.white},group:{gap:7},groupTitle:{fontSize:14,fontWeight:'900',color:palette.ink},choice:{borderWidth:1,borderColor:palette.border,borderRadius:999,paddingHorizontal:10,paddingVertical:8},choiceActive:{backgroundColor:palette.forest,borderColor:palette.forest},choiceText:{fontSize:11,fontWeight:'800',color:palette.inkMuted},choiceTextActive:{color:palette.white},unitRow:{flexDirection:'row',gap:8},unitButton:{flex:1,borderWidth:1,borderColor:palette.border,borderRadius:11,padding:10,alignItems:'center'},unitButtonActive:{backgroundColor:palette.forest,borderColor:palette.forest},unitButtonText:{fontWeight:'900',color:palette.ink},unitButtonTextActive:{color:palette.white},save:{backgroundColor:palette.forest,borderRadius:14,padding:14,alignItems:'center'},saveText:{color:palette.white,fontWeight:'900'},delete:{borderWidth:1,borderColor:palette.danger,borderRadius:14,padding:13,alignItems:'center'},deleteText:{color:palette.danger,fontWeight:'900'}})}
