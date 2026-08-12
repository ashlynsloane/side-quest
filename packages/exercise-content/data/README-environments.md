# Training environment content model

`environment-expansion.json` is the reviewed backlog for environment-aware exercise expansion.

It deliberately separates **exercise content** from **athlete environment classification**. Exercises are not permanently stamped `home` or `gym`; availability and opportunity value are derived from the athlete's training-space equipment profile. Load-aware gym advantage is a separate modeling layer.

Current expansion target:
- 10 home additions focused on sliders and stability ball, the two most underrepresented pieces of the current home setup.
- 22 gym additions focused on machines, cables, foundational barbell/trap-bar movements, and high-load strength opportunities.

Before promoting an entry into `exercises.json`, it must receive the normal Side Quest exercise metadata: body-region and joint loads, avoidance tags, prescriptions, substitution groups, instructions, compatibility, and media treatment. This prevents the environment feature from bypassing existing exercise safety/content validation.
