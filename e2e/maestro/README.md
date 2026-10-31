# Native iOS scripted acceptance

This directory contains **unexecuted** Maestro scenarios until a green native simulator run supplies evidence. The isolated app ID is `com.sidequest.synthetic.qa`, set by the synthetic simulator workflow's ephemeral `app.json` edit.

`synthetic-onboarding-first-week.yaml`: fresh local synthetic athlete -> complete fast-start questionnaire -> automatically generate Week 1 -> open the provisional week. It avoids provider credentials and real training data.

Run only against a fresh synthetic simulator install and with cloud/invite environment variables unset. Future scenarios should include Today/Week/Train start, save partial, cold launch, recovery after interrupted save, plan regeneration, duplicate provider imports, accessibility, and profile isolation. Do not call a scenario 'passing' based solely on a successful iOS JS export or generated YAML.

Maestro CLI documentation: https://docs.maestro.dev/maestro-cli
