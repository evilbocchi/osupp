We need to make an osu! PP calculator for JavaScript!

CONTRIBUTING.md is actually just the personal repo notes for this project. Please read below to understand the context of this project.

## OFFICIAL COLLECTED FROM WAYBACK MACHINE

score 4460552935:

- oct2024: 1886.9pp (huismetbenen says 1886.904/agrees)
- mar2025: 1774.15pp (huismetbenen says 1774.146/agrees)
- oct2025: 1657.26pp (huismetbenen says 1657.255/agrees)

score 4746396766:

- mar2025: 2048.21pp (huismetbenen says 2048.216/agrees)
- oct2025: 1807.26pp (huismetbenen says 1807.261/agrees)

score 244720292:

- dec2017: 532pp (huismetbenen says 534.794/+2.794)
- may2018: 516pp (huismetbenen says 519.772/+3.772)
- feb2019: 548pp (huismetbenen says 556.937/+8.937)
- jan2021: 547.560pp (huismetbenen says 560.586/+13.026)
- jul2021: 537.448pp (huismetbenen says 545.728/+8.280)
- nov2021: 564.057pp (huismetbenen says 559.954/-4.103)
- sep2022: 564.695pp (huismetbenen says 564.7/agrees)
- oct2024: 557.634pp (huismetbenen says 557.639/+0.005)
- mar2025: 558.998pp (huismetbenen says 558.997/-0.001)
- oct2025: 559.973pp (huismetbenen agrees)

score 176782980:

- dec2017: 480pp (huismetbenen says 479.915/agrees)
- may2018: 480pp (huismetbenen says 479.918/agrees)
- feb2019: 522pp (huismetbenen says 523.261/+1.261)
- jan2021: 522.342pp (huismetbenen says 528.356/+6.014)
- jul2021: 528.395pp (huismetbenen says 528.761/+0.366)
- nov2021: 547.810pp (huismetbenen says 546.913/-0.897)
- sep2022: 556.680pp (huismetbenen says 556.7/agrees)
- oct2024: 500.123pp (huismetbenen says 500.124/+0.001)
- mar2025: unknown
- oct2025: 501.838pp (huismetbenen agrees)

score 235561156:

- dec2017: 453pp (huismetbenen says 453.468/agrees)
- may2018: 453pp (huismetbenen says 453.473/agrees)
- feb2019: 487pp (huismetbenen says 487.534/+0.534)
- jan2021: 486.663pp (huismetbenen says 492.065/+5.402)
- jul2021: 493.306pp (huismetbenen says 493.642/+0.336)
- nov2021: unknown
- sep2022: 503.125pp (huismetbenen says 503.1/agrees)
- oct2024: 497.639pp (huismetbenen says 497.638/-0.001)
- mar2025: 500.681pp (huismetbenen says 500.682/+0.001)
- oct2025: 506.433pp (huismetbenen agrees)

score 110536233:

- dec2017: 435pp
- may2018: 435pp
- feb2019: 452pp
- jan2021: 451.998pp (huismetbenen says 456.587/+4.589)
- jul2021: unknown
- nov2021: 507.523pp (huismetbenen says 507.129/-0.394)
- sep2022: 516.224pp (huismetbenen says 516.2/agrees)
- oct2024: 504.307pp (huismetbenen says 504.306/-0.001)
- mar2025: 506.375pp (huismetbenen says 506.374/-0.001)
- oct2025: 523.186pp (huismetbenen agrees)

The simple conclusion is that huismetbenen is fully agreeable for oct2025 and sep2022, maybe even for mar2025 and oct2024. But the drift for older reworks is too high and inconsistent and we want to check ourselves and find osu code that matches the wayback machine numbers.

For now, we aim for parity to wayback machine numbers, or if we don't have the real game code for that we aim for parity to huismetbenen numbers. We expect a precision of 0.001pp to ensure users get the most accurate results possible.

Old pp code that matches the wayback machine numbers is desperately wanted. Please make an issue or PR if you have any!

## COMMITS WE USE RIGHT NOW (./osu_*)

- sep2022: ppy/osu a7799e4f1e6e6e5ab92be4c116a1f9ee77460f53
- oct2024: ppy/osu 105008672d68941679e197bb4f1bf9a6f7258f56
- mar2025: ppy/osu 356281792a893ddf7e637937738fb2b99ff117f1

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

Fixtures in `test/fixtures` are collected from a third-party source (https://pp.huismetbenen.nl/) and are used to validate our calculations. They claim to use:

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
