We need to make an osu! PP calculator for JavaScript!

CONTRIBUTING.md is actually just the personal repo notes for this project. Please read below to understand the context of this project.

## CURRENT PROJECT STATUS

no plans yet = still deciding if we want to implement this  
not triaged = we don't have a stable reference to reliably implement this rework yet  
not started = we haven't started implementing this rework yet  
in progress = we are currently implementing this rework, but values are not accurate  
complete* = we have implemented this rework but subject to change as we can't fully validate it yet or the rework is targeting huismetbenen numbers
complete = we have implemented this rework and it is fully validated against the wayback machine numbers

standard:

- jan2014: not triaged
- feb2015: not triaged
- jul2015: not triaged
- dec2017: complete* (low precision)
- may2018: complete* (low precision)
- feb2019: in progress
- jan2021: not triaged
- jul2021: not triaged
- nov2021: complete* (osu)
- sep2022: complete
- oct2024: complete* (huismetbenen)
- mar2025: complete* (huismetbenen)
- oct2025: complete
- jul2026: complete

taiko: no plans yet  
mania: no plans yet  
catch: no plans yet

## OFFICIAL COLLECTED FROM WAYBACK MACHINE

### `4460552935`

| Rework  |   wayback | huismetbenen    |
| ------- | --------: | --------------- |
| oct2024 |  1886.9pp | 1886.904/agrees |
| mar2025 | 1774.15pp | 1774.146/agrees |
| oct2025 | 1657.26pp | 1657.255/agrees |

### `4746396766`

| Rework  |   wayback | huismetbenen    |
| ------- | --------: | --------------- |
| mar2025 | 2048.21pp | 2048.216/agrees |
| oct2025 | 1807.26pp | 1807.261/agrees |

### `244720292`

| Rework  |   wayback | huismetbenen    |
| ------- | --------: | --------------- |
| dec2017 |     532pp | 534.794/+2.794  |
| may2018 |     516pp | 519.772/+3.772  |
| feb2019 |     548pp | 556.937/+8.937  |
| jan2021 | 547.560pp | 560.586/+13.026 |
| jul2021 | 537.448pp | 545.728/+8.280  |
| nov2021 | 564.057pp | 559.954/-4.103  |
| sep2022 | 564.695pp | 564.7/agrees    |
| oct2024 | 557.634pp | 557.639/+0.005  |
| mar2025 | 558.998pp | 558.997/-0.001  |
| oct2025 | 559.973pp | agrees          |

### `176782980`

| Rework  |   wayback | huismetbenen   |
| ------- | --------: | -------------- |
| dec2017 |     480pp | 479.915/agrees |
| may2018 |     480pp | 479.918/agrees |
| feb2019 |     522pp | 523.261/+1.261 |
| jan2021 | 522.342pp | 528.356/+6.014 |
| jul2021 | 528.395pp | 528.761/+0.366 |
| nov2021 | 547.810pp | 546.913/-0.897 |
| sep2022 | 556.680pp | 556.7/agrees   |
| oct2024 | 500.123pp | 500.124/+0.001 |
| mar2025 |   unknown | unknown        |
| oct2025 | 501.838pp | agrees         |

### `235561156`

| Rework  |   wayback | huismetbenen   |
| ------- | --------: | -------------- |
| dec2017 |     453pp | 453.468/agrees |
| may2018 |     453pp | 453.473/agrees |
| feb2019 |     487pp | 487.534/+0.534 |
| jan2021 | 486.663pp | 492.065/+5.402 |
| jul2021 | 493.306pp | 493.642/+0.336 |
| nov2021 |   unknown | unknown        |
| sep2022 | 503.125pp | 503.1/agrees   |
| oct2024 | 497.639pp | 497.638/-0.001 |
| mar2025 | 500.681pp | 500.682/+0.001 |
| oct2025 | 506.433pp | agrees         |

### `110536233`

| Rework  |   wayback | huismetbenen   |
| ------- | --------: | -------------- |
| dec2017 |     435pp | not checked    |
| may2018 |     435pp | not checked    |
| feb2019 |     452pp | not checked    |
| jan2021 | 451.998pp | 456.587/+4.589 |
| jul2021 |   unknown | unknown        |
| nov2021 | 507.523pp | 507.129/-0.394 |
| sep2022 | 516.224pp | 516.2/agrees   |
| oct2024 | 504.307pp | 504.306/-0.001 |
| mar2025 | 506.375pp | 506.374/-0.001 |
| oct2025 | 523.186pp | agrees         |

The simple conclusion is that huismetbenen is fully agreeable for oct2025 and sep2022, maybe even for mar2025 and oct2024. But the drift for older reworks is too high and inconsistent and we want to check ourselves and find osu code that matches the wayback machine numbers.

For now, we aim for parity to wayback machine numbers, or if we don't have the real game code for that we aim for parity to huismetbenen numbers. We expect a precision of 0.001pp to ensure users get the most accurate results possible.

Old pp code that matches the wayback machine numbers is desperately wanted. Please make an issue or PR if you have any!

## FROM REAL OSU GAME CODE

We have a tiny wrapper around the osu! game code that allows us to run the osu! PP calculator in a .NET environment. This should only be used for validation so that we can ensure our calculations are correct.

PS Z:\osupp> dotnet run --project .\OsuPpApi\OsuPpApi.csproj -p:OsuRework=osu_mar2025 -p:NuGetAudit=false -- .\test\fixtures\244720292_mar2025.json
{
"pp": 558.99656289124,
"aim": 292.5515990593324,
"speed": 137.6196148407219,
"accuracy": 101.42199044300355,
"flashlight": 0,
"effective_miss_count": 0,
"speed_deviation": 10.786193621307557,
"difficulty_attributes": {
"star_rating": 7.692431910060225,
"aim_difficulty": 4.064068686032038,
"speed_difficulty": 3.14395546057069,
"flashlight_difficulty": 0,
"slider_factor": 0.9611451028772987,
"aim_difficult_strain_count": 62.44257295444704,
"speed_difficult_strain_count": 67.01968328370543,
"approach_rate": 10.333333333333332,
"overall_difficulty": 10.444444444444445,
"drain_rate": 6,
"hit_circle_count": 345,
"slider_count": 132,
"spinner_count": 2,
"max_combo": 652,
"speed_note_count": 176.89858208992948
}
}

## SCORE SCHEMA FROM OSU API

{
"classic_total_score": 440479,
"preserve": true,
"processed": true,
"ranked": true,
"maximum_statistics": {
"great": 99,
"legacy_combo_increase": 48
},
"mods": [
{
"acronym": "DT"
},
{
"acronym": "FL"
},
{
"acronym": "CL"
}
],
"statistics": {
"ok": 4,
"great": 95
},
"beatmap_id": 1893461,
"best_id": null,
"id": 1527222675,
"rank": "SH",
"type": "solo_score",
"user_id": 13510304,
"accuracy": 0.973064,
"build_id": null,
"ended_at": "2022-04-17T03:25:05Z",
"has_replay": true,
"is_perfect_combo": false,
"legacy_perfect": false,
"legacy_score_id": 4132936215,
"legacy_total_score": 576423,
"max_combo": 140,
"passed": true,
"pp": 385.758,
"ruleset_id": 0,
"started_at": null,
"total_score": 1050714,
"replay": true,
"current_user_attributes": {
"pin": null
},
"index": 0
}

## TESTS

Fixtures in `fixtures/` are collected from a third-party source (https://pp.huismetbenen.nl/) and are used to validate our calculations. They claim to use:

- jul2026: ppy/osu pp-dev 00d08feb8c4e24a68601773a7a7fa3c59e990aa2
- oct2025: ppy/osu master e1baa0362239ae63ab1618d387f67a6355a70a3a
- mar2025: ppy/osu master e1baa0362239ae63ab1618d387f67a6355a70a3a
- oct2024: Givikap120/osu pp-oct24-mar25 b056a9e617f77114c1c53af0dff8813c58092882
- sep2022: ppy/osu master 00b2bdd0af85c45c72b90b33e9991e76972118ff
- nov2021: ppy/osu master c8a0b6058f4ba5db1fd79707a5c6fd030997cfd7
- jul2021: Givikap120/osu pp-jul21-nov21 5134fa0eb5da4812c68d5ef90809c6f6180585e8
- jan2021: Givikap120/osu pp-jan21-jul21 e3f882846f0f4dfd7e00ad7a8199a6d9c5f9c7c5
- feb2019: Givikap120/osu pp-feb19-jan21 78a8f937273b8e584a71e78586d814b866897fd9
- may2018: Givikap120/osu pp-may18-feb19 d46d1c973a3f3e53c7bfd30d0634c173a2299675
- dec2017: Givikap120/osu pp-dec17-may18 4980fc75dfe9ebb065ebcd220db48f58317bac86
- jul2015: Givikap120/osu pp-jul15-dec17 9e433923e26d21ee2783a2451fcbada31049fe7c
- feb2015: Givikap120/osu pp-feb15-jul15 a4279f8e44f541a785c0450bbecebaecf3a2952e
- jan2014: Givikap120/osu pp-jan14-feb15 41c278f52d547e41b3abf3577a668a63154d290a

From our previous local testing, the results on these commits do not seem to match the actual numbers produced on their service.

huismetbenen is fully reliable for oct2025 and jul2026, but for older reworks the wayback machine should be more relied on.

## CODING STYLE

We know that JavaScript loves camelCase! But internally we use snake_case for all our variables to be consistent with the osu! API. We expose a public camelCase interface for our users.
