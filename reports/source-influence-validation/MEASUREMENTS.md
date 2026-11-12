# Controlled measurements

XYZ values are architectural feet after normalization. Surface Δ = difference between occupied mesh-vertex bins at 0.5 ft; it is not a volume-change percentage. Primary max XY compares corresponding footprint/inner-footprint samples; Z is maximum absolute primary element base-elevation change.

## Extents

| Typology | Mode | Source XYZ | Raw XYZ | Final XYZ |
|---|---|---|---|---|
| contained-room-within-volume | letters | 16.72 × 12.28 × 7.72 | 16.72 × 12.12 × 12.80 | 16.52 × 12.00 × 12.75 |
| contained-room-within-volume | voids | 12.00 × 8.27 × 7.09 | 11.85 × 8.04 × 12.80 | 11.48 × 7.77 × 12.75 |
| contained-room-within-volume | combined | 16.72 × 12.28 × 7.72 | 16.73 × 12.12 × 12.80 | 16.53 × 12.00 × 12.75 |
| flat-deep-plan-plate | letters | 16.72 × 12.28 × 7.72 | 16.72 × 12.12 × 0.80 | 16.52 × 12.40 × 1.20 |
| flat-deep-plan-plate | voids | 12.00 × 8.27 × 7.09 | 11.85 × 8.04 × 0.80 | 12.19 × 8.98 × 1.20 |
| flat-deep-plan-plate | combined | 16.72 × 12.28 × 7.72 | 16.73 × 12.12 × 0.80 | 16.53 × 12.41 × 1.20 |
| vertical-void-lobby | letters | 16.72 × 12.28 × 7.72 | 16.72 × 12.12 × 9.35 | 16.52 × 11.97 × 9.51 |
| vertical-void-lobby | voids | 12.00 × 8.27 × 7.09 | 11.85 × 8.04 × 9.35 | 11.48 × 8.43 × 9.52 |
| vertical-void-lobby | combined | 16.72 × 12.28 × 7.72 | 16.73 × 12.12 × 9.35 | 16.53 × 11.97 × 9.51 |

## Perturbation and removal

| Typology | Mode | Test | Raw topology unchanged | Max primary XY Δ ft | Max primary Z Δ ft | Final surface Δ % | Final component count |
|---|---|---|---|---|---|---|---|
| contained-room-within-volume | letters | perturbation | Yes | 0.0147 | 0.0000 | 0.40 | 1 |
| contained-room-within-volume | letters | removal | Yes | 0.9184 | 0.0000 | 11.17 | 1 |
| contained-room-within-volume | voids | perturbation | Yes | 1.8958 | 0.0000 | 47.28 | 1 |
| contained-room-within-volume | voids | removal | Yes | 1.8351 | 0.0000 | 46.37 | 1 |
| contained-room-within-volume | voids | voidRemoval | Yes | 0.4708 | 0.0000 | 11.08 | 1 |
| contained-room-within-volume | combined | perturbation | Yes | 0.1369 | 0.0000 | 3.99 | 1 |
| contained-room-within-volume | combined | removal | Yes | 0.9366 | 0.0000 | 16.93 | 1 |
| contained-room-within-volume | combined | voidRemoval | Yes | 0.0063 | 0.0000 | 0.04 | 1 |
| flat-deep-plan-plate | letters | perturbation | Yes | 0.0079 | 0.0202 | 0.40 | 1 |
| flat-deep-plan-plate | letters | removal | Yes | 0.0137 | 0.0018 | 0.56 | 1 |
| flat-deep-plan-plate | voids | perturbation | Yes | 0.5817 | 0.2503 | 53.70 | 1 |
| flat-deep-plan-plate | voids | removal | Yes | 1.8351 | 0.0010 | 25.48 | 1 |
| flat-deep-plan-plate | voids | voidRemoval | Yes | 0.0159 | 0.0038 | 0.00 | 1 |
| flat-deep-plan-plate | combined | perturbation | Yes | 0.1553 | 0.0845 | 2.74 | 1 |
| flat-deep-plan-plate | combined | removal | Yes | 0.5636 | 0.0108 | 1.96 | 1 |
| flat-deep-plan-plate | combined | voidRemoval | Yes | 0.0063 | 0.0007 | 0.40 | 1 |
| vertical-void-lobby | letters | perturbation | Yes | 0.0075 | 0.0000 | 0.22 | 1 |
| vertical-void-lobby | letters | removal | Yes | 0.0137 | 0.0000 | 11.03 | 1 |
| vertical-void-lobby | voids | perturbation | Yes | 0.5817 | 0.0000 | 44.65 | 1 |
| vertical-void-lobby | voids | removal | Yes | 1.8351 | 0.0000 | 39.86 | 1 |
| vertical-void-lobby | voids | voidRemoval | Yes | 0.0159 | 0.0000 | 15.39 | 1 |
| vertical-void-lobby | combined | perturbation | Yes | 0.2768 | 0.0000 | 2.52 | 1 |
| vertical-void-lobby | combined | removal | Yes | 1.2538 | 0.0000 | 12.75 | 1 |
| vertical-void-lobby | combined | voidRemoval | Yes | 0.0072 | 0.0000 | 0.46 | 1 |

## Application preservation

- amphitheaterPrototype.ts: unchanged
- PrototypeDemonstration.tsx: unchanged
- CompositionStudio.tsx: unchanged
