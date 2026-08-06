# Side Quest V18.1 — External Strength / HIIT Patch

This patch extends the V18 read-only Strava integration without replacing direct Side Quest strength history.

## Behavior

- Imports Strava `HighIntensityIntervalTraining`, `Workout`, `WeightTraining`, strength-training, functional-strength, and CrossFit activity types.
- Classifies imported activities as `HIIT / class` or `strength` using Strava sport type and activity name.
- Matches external classes to planned `Strength` events and class-like `Other` events such as `X-Train: Onix`.
- Keeps matching one-to-one and conservative.
- Gives no muscle-region credit to an external class until the athlete classifies it.
- Offers `Full-body strength class`, `Conditioning only`, and `Ignore` choices.
- Caps manually classified full-body class credit at 4 low-confidence contribution points and keeps it separate from exercise-level strength history.
- Never triggers automatic strength replanning from a generic external HIIT/strength class.
- Counts only match-eligible planned events in the Planned-versus-Completed summary.
- Clarifies match and intensity labels and uses Strava local time for completed-activity display.

## Cloud deployment

After the local installer passes, deploy the updated Strava ingestion bundle:

```bash
cd ~/Downloads/SideQuest_V18_1_HIIT_Patch
./deploy-v18-1-cloud.sh /Users/ashlynsloane/Developer/circuit-generator
```

Then open Side Quest and tap **Sync now**. The first sync without any imported class activity requests a one-year backfill; later manual syncs use the normal shorter window.
