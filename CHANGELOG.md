# Changelog

## [2.1.5](https://github.com/47ng/actions-clever-cloud/compare/v2.1.4...v2.1.5) (2026-07-24)


### Bug Fixes

* keep the deploy alive when a console log sink dies ([#269](https://github.com/47ng/actions-clever-cloud/issues/269)) ([2240d82](https://github.com/47ng/actions-clever-cloud/commit/2240d82dc6bc2ba7d1eded9e40927ee8d068c897)), closes [#257](https://github.com/47ng/actions-clever-cloud/issues/257)

## [2.1.4](https://github.com/47ng/actions-clever-cloud/compare/v2.1.3...v2.1.4) (2026-07-23)


### Bug Fixes

* accept Clever-compatible environment names ([#249](https://github.com/47ng/actions-clever-cloud/issues/249)) ([07f1915](https://github.com/47ng/actions-clever-cloud/commit/07f1915266f245065b911686d66e685f51a8af47))
* apply backpressure to deploy output ([#254](https://github.com/47ng/actions-clever-cloud/issues/254)) ([6baf056](https://github.com/47ng/actions-clever-cloud/commit/6baf056a3d0c406b03273254fbee75f394ac0de6))
* detect no-property workflow commands ([#252](https://github.com/47ng/actions-clever-cloud/issues/252)) ([4e59262](https://github.com/47ng/actions-clever-cloud/commit/4e5926207f54fe615fe73c9a55734058aef410eb))
* fail signal-terminated deployments ([#248](https://github.com/47ng/actions-clever-cloud/issues/248)) ([cd4db7b](https://github.com/47ng/actions-clever-cloud/commit/cd4db7b25d4010204e0d15280adbbfe510d4a8a2))
* make appID linking idempotent ([#250](https://github.com/47ng/actions-clever-cloud/issues/250)) ([ca22639](https://github.com/47ng/actions-clever-cloud/commit/ca22639ded19791a6f90d3c4b59581c7a192de72)), closes [#222](https://github.com/47ng/actions-clever-cloud/issues/222)
* preserve setEnv value semantics ([#253](https://github.com/47ng/actions-clever-cloud/issues/253)) ([da54950](https://github.com/47ng/actions-clever-cloud/commit/da5495018b1572213a19b033bbe704c2c4fccd05))
* tolerate deployment log open failures ([#251](https://github.com/47ng/actions-clever-cloud/issues/251)) ([23e6404](https://github.com/47ng/actions-clever-cloud/commit/23e6404155ef2380c359b54200cf9230aea57817))

## [2.1.3](https://github.com/47ng/actions-clever-cloud/compare/v2.1.2...v2.1.3) (2026-07-22)


### Bug Fixes

* credential hygiene, truthful deployPath docs, robust log pipeline ([#234](https://github.com/47ng/actions-clever-cloud/issues/234)) ([0006b87](https://github.com/47ng/actions-clever-cloud/commit/0006b87d109045ebe2895f930da6dbc6eae5105b))
* warn on ignored setEnv lines, reject invalid timeout values ([#236](https://github.com/47ng/actions-clever-cloud/issues/236)) ([fcdaf0b](https://github.com/47ng/actions-clever-cloud/commit/fcdaf0b13004a994e2ad388f92414801f1eb1ed8))

## [2.1.2](https://github.com/47ng/actions-clever-cloud/compare/v2.1.1...v2.1.2) (2026-07-22)


### Bug Fixes

* patch vulnerable transitive deps (simple-git, lodash) ([#235](https://github.com/47ng/actions-clever-cloud/issues/235)) ([fcc7d1f](https://github.com/47ng/actions-clever-cloud/commit/fcc7d1f7176ac85a2c22da96c505d96956727130))
* semver regex blocking prereleases, harden ref_name in CD workflow ([#233](https://github.com/47ng/actions-clever-cloud/issues/233)) ([ab7b315](https://github.com/47ng/actions-clever-cloud/commit/ab7b315d7e32a9f21ee254d6035722d2be6ac9bd))
