class MapApp {

    constructor() {

        // local properties (state)
        this.map = null;
        this.infoDiv = document.getElementById('info');
        this.layers = [];
        
        // config
        this.layerConfigs = [
            ["./green_spaces.json", "#adc57b", 1, 1, false],
            ["./sidewalks.json", "#999999", 1, 2, false],
            ["./water.json", "#91cbef", 1, 3, false],
            ["./buildings.json", "#d0b38f", 1, 4, false],
            ["./subway.geojson", "#444444", 4, 5, false],
            ["./sights.geojson", "#FFEA00", 1, 6, true] // index 5
        ];

        this.personIcon = L.icon({
            iconUrl: './assets/person.png',
            iconSize: [24, 24], // size here is in pixels
        });

        this.userMarker;
        this.userMarkerCircleSm;
        this.userMarkerCircleLg;
    }

    init() {
        this.setupMap();
        this.addTileLayer();
        this.loadGeoJsonLayers();
        this.bindGlobalEvents();
        this.locateUser();
    }

    // init map
    setupMap() {
        this.map = L.map('map', {
            preferCanvas: true,
            center: [43.6425099, -79.3745239],
            zoom: 13
        });
    }

    // add base tile layer
    addTileLayer() {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);
    }

    // create and add GeoJSON layers based on config values
    loadGeoJsonLayers() {
        this.layerConfigs.forEach((config, i) => {
            const [url, color, weight, zIndex] = config;

            // add each layer to a new map pane, to control z-index ordering
            const paneName = `pane${i}`;
            this.map.createPane(paneName);
            this.map.getPane(paneName).style.zIndex = 500 + zIndex;

            // load GeoJSON layer with AJAX, style, and store reference to it in an array
            this.layers[i] = new L.GeoJSON.AJAX(url, {
                style: () => ({
                    color: color,
                    weight: weight,
                    fillOpacity: 0.5
                }),
                pane: paneName,
                onEachFeature: (feature, layer) => {
                    layer.on('click', (e) => {
                        this.handleSightClick(feature, layer);
                    });
                }
            });

            this.layers[i].addTo(this.map);

        });

    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleSightClick(feature, layer) {

        const props = feature.properties;

        // populate the info bar
        this.infoDiv.innerHTML = `
            <h2>${props['SightName']}</h2>
            <img src="./images/${props['SightImage']}" alt="${props['SightName']}" />
            <p>${props['SightDesc']}</p>
        `;

        // reset styles for all sights in the layer
        this.layers[5].setStyle({ 
            fillColor: "#FFEA00", 
            color: "#FFEA00", 
            weight: 1 
        });

        // 3. Highlight only the clicked layer (the visual object)
        layer.setStyle({ 
            fillColor: "#FFA500", 
            color: "#FFA500", 
            weight: 3 
        });

        // center and zoom to the clicked sight
        this.map.fitBounds(layer.getBounds(), { 
            maxZoom: 16, 
            animate: true 
        });
    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            if (this.map) this.map.invalidateSize();
        });

        // draw circle to highlight current user location when/if determined
        this.map.on('locationfound', (e) => {

            if (!this.userMarker) {
                const paneName = 'pane'+this.layerConfigs.length;
                this.map.createPane(paneName);
                this.map.getPane(paneName).style.zIndex = 1000;
                this.map.getPane('pane5').style.zIndex = 1001;
                this.userMarker=L.marker(e.latlng, {icon: this.personIcon, pane: paneName}).addTo(this.map);
                this.userMarkerCircleSm=L.circle(e.latlng, {radius: 12, pane: paneName}).addTo(this.map).setStyle({ 
                    fillColor: "#2f8cdd", 
                    color: "transparent", 
                    weight: 2 
                });
                this.userMarkerCircleLg=L.circle(e.latlng, {radius: 1000, pane: paneName }).addTo(this.map).setStyle({ 
                    fillColor: "transparent", 
                    color: "#2f8cdd", 
                    dashArray: '5, 5',
                    weight: 2
                });
            } else {
                this.userMarker.setLatLng(e.latlng);
                this.userMarkerCircleSm.setLatLng(e.latlng);
                this.userMarkerCircleLg.setLatLng(e.latlng);
            }

        });
    }

    // trigger a request to determine user's current location
    locateUser() {
        this.map.locate({watch: true, maximumAge: 0, enableHighAccuracy: true});
    }
}

// init the app
const myMapApp = new MapApp();
myMapApp.init();