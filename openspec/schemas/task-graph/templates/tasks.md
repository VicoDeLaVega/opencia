## 1. <!-- Task Group Name -->

- [ ] 1.1 <!-- Task description --> | depends: none | difficulty: <!-- easy|medium|hard --> | verify: <!-- test/command/check --> | status: not_started | files: none | generate: none
- [ ] 1.2 <!-- Task description --> | depends: 1.1 | difficulty: <!-- easy|medium|hard --> | verify: <!-- test/command/check --> | status: not_started | files: none | generate: none

## 2. <!-- Task Group Name -->

- [ ] 2.1 <!-- Task description --> | depends: <!-- e.g. 1.1,1.2 --> | difficulty: <!-- easy|medium|hard --> | verify: <!-- test/command/check --> | status: not_started | files: none | generate: none
- [ ] 2.2 <!-- Task description --> | depends: 2.1 | difficulty: <!-- easy|medium|hard --> | verify: <!-- test/command/check --> | status: not_started | files: none | generate: none

<!-- Only if the change actually needs generated game art (sprite/icon/tile/background):
- [ ] 3.1 Generate <!-- asset --> | depends: none | difficulty: easy | verify: <!-- what a passing asset looks like --> | status: not_started | files: none | generate: image_generation/venv/bin/python image_generation/cli.py "<!-- real, specific prompt -->" --mode pixel_art --task-file <!-- this file's path --> --task-id 3.1
-->
