import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLatestTrainingBlock } from '@/services/database';

export default function PlanDashboardScreen() {
  const router = useRouter();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void getLatestTrainingBlock().then((saved) => {
      if (!cancelled) setBlock(saved?.block ?? null);
    });
    return () => { cancelled = true; };
  }, []));

  const sessions = useMemo(() => block?.weeks.flatMap((week) => week.sessions) ?? [], [block]);
  const completed = sessions.filter((session) => session.completionStatus === 'completed').length;
  const skipped = sessions.filter((session) => session.completionStatus === 'skipped').length;
  const upcoming = sessions
    .filter((session) => session.completionStatus !== 'completed' && session.completionStatus !== 'skipped' && session.date >= todayKey())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const daysRemaining = block?.goal.eventDate ? Math.max(0, differenceInDays(todayKey(), block.goal.eventDate)) : null;
  const adherence = sessions.length ? Math.round(completed / sessions.length * 100) : 0;

  async function sharePlan() {
    if (!block) return;
    await Share.share({ message: formatPlan(block) });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Home</Text></Pressable>
        <Text style={styles.topTitle}>Plan dashboard</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!block ? (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>No active goal plan</Text>
            <Text style={styles.body}>Build a goal-based plan first. This dashboard will then track the block from now through race day.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>CURRENT BLOCK</Text>
              <Text style={styles.heroTitle}>{block.goal.name}</Text>
              <Text style={styles.countdown}>{daysRemaining !== null ? `${daysRemaining} days` : 'Ongoing goal'}</Text>
              <Text style={styles.heroBody}>{block.goal.eventDate ? `until ${formatDate(block.goal.eventDate)} · ` : ''}{block.numberOfWeeks}-week strength block</Text>
            </View>

            <View style={styles.metricsRow}>
              <Metric value={`${adherence}%`} label="completed" />
              <Metric value={`${completed}`} label="sessions done" />
              <Metric value={`${skipped}`} label="skipped" />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Block progress</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, adherence)}%` }]} /></View>
              <Text style={styles.body}>{completed} of {sessions.length} planned strength sessions completed.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Coming up</Text>
              {upcoming.length === 0 ? <Text style={styles.body}>No remaining planned strength sessions.</Text> : null}
              {upcoming.map((session) => <SessionRow key={session.id} session={session} />)}
            </View>

            <View style={styles.callout}>
              <Text style={styles.sectionTitle}>Planning principle</Text>
              <Text style={styles.body}>{phaseMessage(block)}</Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable onPress={() => router.push('/adaptive-plan' as Href)} style={styles.actionCard}>
                <Text style={styles.actionEyebrow}>ADAPTIVE</Text>
                <Text style={styles.actionTitle}>Scan plan health</Text>
                <Text style={styles.actionBody}>Find conflicts and preview automatic moves.</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/race-readiness' as Href)} style={styles.actionCard}>
                <Text style={styles.actionEyebrow}>EVENT PREP</Text>
                <Text style={styles.actionTitle}>Race readiness</Text>
                <Text style={styles.actionBody}>Taper guardrails and checklist.</Text>
              </Pressable>
            </View>

            <Pressable onPress={sharePlan} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Share or export plan summary</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function SessionRow({ session }: { session: PlannedStrengthSession }) {
  return <View style={styles.sessionRow}><View style={styles.dateBadge}><Text style={styles.dateDay}>{new Date(`${session.date}T12:00:00`).getDate()}</Text><Text style={styles.dateMonth}>{new Intl.DateTimeFormat('en-US',{month:'short'}).format(new Date(`${session.date}T12:00:00`))}</Text></View><View style={{flex:1}}><Text style={styles.sessionTitle}>{session.title}</Text><Text style={styles.body}>{session.workout.request.workMinutes} min · {formatStatus(session.completionStatus)}</Text></View></View>;
}
function formatPlan(block: TrainingBlockPlan) {
  const lines = [`${block.goal.name}`, ...(block.goal.eventDate ? [`Event: ${formatDate(block.goal.eventDate)}`] : []), `${block.numberOfWeeks}-week strength block`, ''];
  for (const [weekIndex, week] of block.weeks.entries()) {
    lines.push(`Week ${week.weekNumber ?? weekIndex + 1} · ${week.phase.replaceAll('_',' ')}`);
    for (const session of week.sessions) lines.push(`- ${formatDate(session.date)}: ${session.title} (${session.workout.request.workMinutes} min)`);
    lines.push('');
  }
  return lines.join('\n');
}
function phaseMessage(block: TrainingBlockPlan) {
  const today = todayKey();
  const week = block.weeks.find((item) => item.weekStartDate <= today && addDays(item.weekStartDate, 6) >= today) ?? block.weeks[0];
  if (!week) return 'Keep strength coordinated with the rest of the training calendar.';
  if (week.phase === 'race_week') return 'This is race week. Preserve movement quality and freshness; do not chase additional fitness now.';
  if (week.phase === 'taper') return 'Strength volume should fall while familiar movement patterns remain in the plan.';
  if (week.phase === 'peak') return 'Maintain the most useful strength qualities while protecting key endurance sessions.';
  return 'Build durable strength gradually while keeping the key swim, bike, and run sessions high quality.';
}
function todayKey(){ return new Date().toISOString().slice(0,10); }
function differenceInDays(from:string,to:string){ return Math.ceil((new Date(`${to}T12:00:00`).getTime()-new Date(`${from}T12:00:00`).getTime())/86400000); }
function addDays(value:string, days:number){ const date=new Date(`${value}T12:00:00`); date.setDate(date.getDate()+days); return date.toISOString().slice(0,10); }
function formatDate(value:string){ return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`)); }
function formatStatus(value: PlannedStrengthSession['completionStatus']){ return value === 'modified' ? 'modified' : value; }

const c={bg:'#E4EBE3',card:'#FFF',ink:'#01234D',muted:'#6B7770',border:'#164C73',accent:'#153E2F',soft:'#D8E9DF',warm:'#F4E7D2'};
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:c.bg},topBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderBottomColor:c.border,backgroundColor:c.card},backButton:{flex:1,paddingVertical:6},backText:{color:c.accent,fontSize:16,fontWeight:'700'},topTitle:{color:c.ink,fontSize:17,fontWeight:'700'},content:{padding:20,paddingBottom:60,gap:16},hero:{backgroundColor:c.accent,borderRadius:24,padding:20,gap:5},eyebrow:{color:'#C9DDD1',fontSize:11,fontWeight:'800',letterSpacing:1.2},title:{color:c.ink,fontSize:28,fontWeight:'800',lineHeight:34},heroTitle:{color:'#FFF',fontSize:28,fontWeight:'800',lineHeight:34},heroBody:{color:'#D7E6DD',fontSize:14,lineHeight:20},countdown:{color:'#FFF',fontSize:40,fontWeight:'800',marginTop:8},body:{color:c.muted,fontSize:14,lineHeight:20},metricsRow:{flexDirection:'row',gap:8},metric:{flex:1,backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:16,padding:13},metricValue:{color:c.accent,fontSize:22,fontWeight:'800'},metricLabel:{color:c.muted,fontSize:11,fontWeight:'700',marginTop:3},card:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:20,padding:17,gap:12},emptyCard:{backgroundColor:c.card,borderRadius:20,padding:20,gap:8},sectionTitle:{color:c.ink,fontSize:18,fontWeight:'800'},track:{height:11,borderRadius:8,backgroundColor:c.soft,overflow:'hidden'},fill:{height:11,backgroundColor:c.accent,borderRadius:8},sessionRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:5},dateBadge:{width:48,height:48,borderRadius:13,backgroundColor:c.soft,alignItems:'center',justifyContent:'center'},dateDay:{color:c.accent,fontSize:17,fontWeight:'800'},dateMonth:{color:c.accent,fontSize:10,fontWeight:'800',textTransform:'uppercase'},sessionTitle:{color:c.ink,fontSize:15,fontWeight:'800'},callout:{backgroundColor:c.warm,borderRadius:20,padding:17,gap:6},actionRow:{flexDirection:'row',gap:10},actionCard:{flex:1,backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:16,padding:14,gap:5},actionEyebrow:{color:c.accent,fontSize:9,fontWeight:'900',letterSpacing:1},actionTitle:{color:c.ink,fontSize:15,fontWeight:'800'},actionBody:{color:c.muted,fontSize:11,lineHeight:16},primaryButton:{backgroundColor:c.accent,borderRadius:16,padding:16,alignItems:'center'},primaryText:{color:'#FFF',fontSize:15,fontWeight:'800'}});
