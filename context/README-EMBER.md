# 🔥 EMBER

**Enhanced fire monitoring platform: from raw "red dots" to actionable, inclusive, community-verified information.**

EMBER builds on NASA FIRMS satellite thermal data and addresses what the standard FIRMS map leaves to the user: duplicate overlapping detections, no seasonality view, no guidance on what a hotspot means for you, no health or heat context, a dense interface that is hard for many people to use, and no way to tell a farm burn from a wildfire.

> **Important:** A satellite detection is a *thermal anomaly*, not confirmation of a wildfire. EMBER supports, but does not replace, official emergency-response systems and the guidance of local DRRMOs and health authorities.

---

## Table of Contents

- [Why EMBER?](#why-ember)
- [Feature Details](#feature-details)
  - [1. Sensor Integration and Data Harmonization](#1-sensor-integration-and-data-harmonization)
  - [2. Interactive Burning Calendar](#2-interactive-burning-calendar)
  - [3. Smart Action Guide](#3-smart-action-guide)
  - [4. Heat Index and Health Alerts](#4-heat-index-and-health-alerts)
  - [5. Accessible Design](#5-accessible-design)
  - [6. LGU and Community Feedback Loop](#6-lgu-and-community-feedback-loop)
- [Notification and Alert System](#notification-and-alert-system)
- [Scope and Limitations](#scope-and-limitations)
- [Open Design Questions](#open-design-questions)
- [Data Sources and Attribution](#data-sources-and-attribution)

---

## Why EMBER?

| Feature / Capability | Standard NASA FIRMS | EMBER (Enhanced Platform) |
|---|---|---|
| **Sensor Integration and Resolution** | Displays MODIS (1 km) and VIIRS (375 m) as separate, overlapping layers, often resulting in messy duplicate dots. | **True Data Harmonization:** fuses, deduplicates, and cross-calibrates MODIS and VIIRS into a unified thermal cluster layer with confidence scores. |
| **Temporal Tracking and Burning Calendar** | Limited to basic date-range map filtering and raw CSV downloads; lacks built-in visual seasonality tools. | **Interactive Burning Calendar:** visualizes daily/monthly fire frequency heatmaps, peak burn seasons, and historical anomaly comparisons at a glance. |
| **Data Actionability** | Provides raw geospatial data ("red dots"). Users must independently figure out what the fire threat means for them. | **Smart Action Guide:** translates raw data into practical, location-aware guidance (what to do, what to bring, what to prepare). |
| **Health and Environmental Context** | Focuses strictly on surface thermal anomalies; ignores human physiological risk (ambient temperature, smoke). | **Heat Index and Health Alerts:** integrates real-time heat index and air quality metrics, pushing proactive alerts when health risks peak. |
| **Inclusivity and Accessibility** | Dense, highly technical interface relying on standard thermal color scales that can be difficult for colorblind users. | **Accessible Design:** colorblind-safe palettes (e.g., Viridis/Cividis), high-contrast modes, and localized languages for rural communities. |
| **Ground-Truthing and Verification** | No verification mechanism; a controlled agricultural burn looks identical to an emergency wildfire on the map. | **LGU and Community Feedback Loop:** empowers local DRRMOs and vetted responders to tag hotspots as *Verified Wildfire*, *Farm Burn*, or *False Alarm*. |

---

## Feature Details

### 1. Sensor Integration and Data Harmonization

MODIS (about 1 km resolution) and VIIRS (about 375 m resolution) observe the same fires at different scales, so a single burning area can appear as several overlapping dots on the standard FIRMS map.

EMBER treats the two products as one source of evidence:

- **Fuse** MODIS and VIIRS detections into a single thermal cluster layer.
- **Deduplicate** overlapping detections of the same thermal event.
- **Cross-calibrate** product-specific values so they can be compared.
- **Score confidence** for each cluster, while retaining the original product values for traceability.

### 2. Interactive Burning Calendar

Standard FIRMS offers date-range filtering and raw CSV downloads. EMBER adds a visual seasonality view:

- Daily and monthly **fire frequency heatmaps**
- **Peak burn seasons** at a glance
- **Historical anomaly comparison** (is this period unusual compared with past years?)

### 3. Smart Action Guide

Raw hotspots do not tell people what to do. The Smart Action Guide turns detections into **location-aware guidance**:

- **What to do**
- **What to bring**
- **What to prepare**

### 4. Heat Index and Health Alerts

Fire detection alone ignores human physiological risk. EMBER integrates **real-time heat index** and **air quality** metrics and proactively alerts users when health risks peak. See [Notification and Alert System](#notification-and-alert-system).

### 5. Accessible Design

- **Colorblind-safe palettes** such as Viridis or Cividis instead of standard thermal color scales
- **High-contrast mode**
- **Localized languages** for rural communities
- Simple, plain-language presentation instead of a dense technical interface

### 6. LGU and Community Feedback Loop

Local DRRMOs and vetted responders can tag hotspots so that users can tell what a detection actually is:

| Tag | Meaning |
|---|---|
| ✅ **Verified Wildfire** | Confirmed uncontrolled fire |
| 🌾 **Farm Burn** | Controlled agricultural burn |
| ❌ **False Alarm** | Not a fire (for example, a non-fire heat source) |

Only vetted accounts can apply tags, and each tag should record who applied it and when.

---

## Notification and Alert System

### Heat index alerts by level

EMBER sends a heat index alert matched to the **level** of risk. The levels below follow the Philippine classification used by PAGASA.

| Level | Heat index | Typical health risk | Alert behavior |
|---|---|---|---|
| **Caution** | 27°C to 32°C | Fatigue is possible with prolonged exposure | Optional / informational |
| **Extreme Caution** | 33°C to 41°C | Heat cramps and heat exhaustion possible; continued activity could lead to heat stroke | Alert with prevention tips |
| **Danger** | 42°C to 51°C | Heat cramps and heat exhaustion likely; heat stroke probable with continued exposure | Prominent alert with mitigation steps |
| **Extreme Danger** | 52°C and above | Heat stroke highly likely; medical emergency | Highest-priority alert with immediate actions |

> The thresholds should be kept configurable and checked against current PAGASA classifications before release.

### When the heat index peaks

Once the heat index **reaches its peak** for the user's area, EMBER:

1. **Notifies the user** that the heat index has peaked, with the current level.
2. **Suggests ways to mitigate health-related concerns** for that level.

Example mitigation suggestions (general guidance, to be reviewed with health authorities):

- Drink water regularly, even before feeling thirsty
- Limit outdoor activity during the hottest hours of the day
- Rest in shade or a cool, ventilated place
- Wear light, loose, light-colored clothing and use a hat or umbrella
- Check on children, older adults, and people with health conditions
- Know the signs of heat exhaustion and heat stroke, and seek medical help immediately if they appear

### Inclusivity and accessibility in alerts

- **Plain language**, with the level, the meaning, and what to do in one short message
- **Not color alone:** every level has a distinct **icon and text label** in addition to color, using colorblind-safe palettes
- **Localized languages** for rural communities (for example, English, Filipino, and Cebuano/Bisaya)
- **High-contrast** and screen-reader-friendly alert displays
- Delivery channels that reach users with limited connectivity (for example, in-app plus SMS), to be decided

**Sample alert (English):**

> **Heat Index: DANGER (42°C)**
> The heat index in your area has peaked. Heat exhaustion is likely. Stay in a cool place, drink water often, avoid outdoor work until it cools, and check on children and older family members.

**Sample alert (Cebuano/Bisaya):**

> **Heat Index: DANGER (42°C)**
> Mitaas na pag-ayo ang heat index sa inyong lugar. Posible kaayo ang heat exhaustion. Pabilin sa bugnaw nga lugar, inom ug tubig kanunay, likayi ang trabaho sa gawas hangtod mokunhod ang init, ug tan-awa ang mga bata ug tigulang.

> Sample translations should be reviewed by native speakers and local partners before use.

---

## Scope and Limitations

- Satellite detections are thermal anomalies, not confirmed fire incidents.
- Satellite observations are intermittent; EMBER should not imply continuous observation between overpasses.
- Community and LGU tags are only as authoritative as the vetting behind them.
- Health suggestions are general guidance, not medical advice, and do not replace advice from health authorities.
- EMBER is not an emergency dispatch system.

## Open Design Questions

- **Heat index source:** use PAGASA's published values, or compute from temperature and humidity?
- **Air quality source:** which dataset or provider?
- **Peak detection:** how is "peak" defined (daily forecast maximum, threshold crossing, or both)?
- **Alert channels:** in-app, SMS, push, or a combination?
- **Verification workflow:** how are DRRMOs and responders vetted, and how are conflicting tags resolved?
- **Languages:** which local languages ship first?

## Data Sources and Attribution

- **Satellite data:** [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (MODIS and VIIRS thermal anomaly products)
- **Heat index classification:** PAGASA (Philippine Atmospheric, Geophysical and Astronomical Services Administration)
- **Air quality data:** to be determined

---

## License

_To be determined._
