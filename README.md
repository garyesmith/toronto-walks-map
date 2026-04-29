# Toronto Walks

Toronto Walks is browser app designed to showcase interesting walks around downtown Toronto, intended for use by curious locals and visitors alike. The interface works on mobile and desktop devices, and allows users to follow along on a live map to read details about various sights they encounter along their walk. The writing highlights the culture and history of places that casual pedestrians might not otherwise be aware of.

The app is has been published live at [https://torontowalks.ca](https://torontowalks.ca).

**Available Walks**

Currently, the app is populated with four walks:

- *CN Tower to Distillery Walk:* A west-to-east overview of many of Toronto's most well-known attractions and historical sights.

- *Old Town Toronto Walk:* A clockwise circuit of Toronto's oldest neighbourhood.

- *Canary District Walk:* One of Toronto's newest neighbourhoods, built on industrial lands repurposed for the 2015 Pan Am Games.

- *Corktown Walk:* Explore one of Toronto's oldest neighbourhoods, a working class area built by Irish immigrants.

**Implementation Notes**

This single-page web app was coded in Javascript using [Leaflet.js](https://leafletjs.com/) 2.0 with the LocateControl and ExtraMarkers plugins. An [OpenStreetMap](https://www.openstreetmap.org/) base layer was used, enhanced with additional custom map layers created in QGIS from [City of Toronto Open Data Portal](https://open.toronto.ca/) shape files for streets, sidewalks, green spaces and building outlines. QGIS was also used to create point and line vector layers for the walk paths and sights of interest. These custom map layers were exported as GeoJSON for ingestion into the Leaflet app.

It was tempting to add more features, but rather than try to compete with Google Maps, I decided to stay true to the initial purpose of this app, which was to provide clear and simple walking directions for a selected number of sights.

Future enhancements may include improved accessibility related to keyboard-only usage, as well as additional walks.

