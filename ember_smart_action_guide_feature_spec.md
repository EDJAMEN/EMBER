# 🛡️ EMBER Smart Action Guide

## 1. Proposed Feature Overview

**Feature Name:** EMBER Smart Action Guide  
**Purpose:** Provide users with practical, location-specific safety recommendations based on active burning activity and local environmental conditions.

Rather than simply displaying raw satellite hotspot detections on a map, the **Smart Action Guide** translates thermal and environmental data into clear, actionable guidance—helping residents, responders, and local communities understand what steps to take to stay safe and prepared.

---

## 2. Example Output: Malaybalay City, Bukidnon

> ### 📍 Smart Action Guide — Malaybalay City, Bukidnon
> 
> #### ⚠️ Environmental Update
> * **Hotspot activity detected** within the selected monitoring area.
> * *Note:* A satellite thermal hotspot indicates a high-temperature surface anomaly and is **not automatically a confirmed wildfire**.
> 
> #### ✅ Recommended Actions
> * Check the exact hotspot location and verify against nearby official fire reports.
> * Monitor official announcements from the local **DRRMO** (Disaster Risk Reduction and Management Office).
> * If smoke or haze is present, limit strenuous outdoor activities.
> * Prepare essential emergency supplies if local authorities advise increased readiness.
> 
> #### 🎒 What to Prepare / Bring
> * Drinking water
> * Face mask (**N95** recommended if smoke or poor air quality is present)
> * First-aid kit
> * Flashlight and essential emergency supplies

---

## 3. Main Components

| Component | What It Does |
| :--- | :--- |
| **Location-Based Advisory** | Tailors safety recommendations specifically to the user's selected municipality, city, or monitoring zone. |
| **Hotspot Alert** | Informs users when MODIS or VIIRS satellite hotspots are detected within proximity of their area, clarifying confidence levels. |
| **Heat Safety Recommendations** | Provides heat-illness precautions based on current local temperature and heat index readings. |
| **Smoke and Health Advisory** | Issues respiratory and outdoor-activity precautions when smoke plumes or unhealthy air quality are detected. |
| **What to Bring / Prepare** | Dynamically suggests practical items and emergency supplies tailored to current environmental hazards. |
| **Recommended Actions** | Lists clear, step-by-step measures users can take immediately to stay informed and safe. |

---

## 4. How the Feature Works (Data-to-Action Pipeline)

1. **Selected Location**  
   The user selects a target area or municipality on the EMBER map (e.g., *Malaybalay City*).
2. **Environmental Information Aggregation**  
   The system gathers real-time contextual data for that zone, including nearby **MODIS/VIIRS hotspot detections**, **heat index**, **local weather** (wind/temperature), and **air quality**.
3. **Recommendation Engine**  
   A rule-based logic layer evaluates the combined threat indicators and matches them against established public safety and DRRMO preparedness guidelines.
4. **Smart Action Guide Output**  
   The UI renders a clear, digestible advisory card organized into **What to Do**, **What to Bring**, and **What to Prepare**.