class MapApp {

    constructor() {

        // local properties (state)
        this.map = null;
        this.infoDiv = document.getElementById('info');
        this.mapLayers = [];
        this.walkLayer = null;
        
        // config (json file, color, weight)
        this.layerConfigs = [
            ["./green_spaces.json", "#adc57b", 1],
            ["./sidewalks.json", "#999999", 1],
            ["./water.json", "#91cbef", 1],
            ["./buildings.json", "#d0b38f", 1]
        ];

        this.mapMarker = L.ExtraMarkers.icon({
            markerColor: 'cyan',
            shape: 'circle',
            prefix: 'fa'
        });

        this.selectedMapMarker = L.ExtraMarkers.icon({
            markerColor: 'orange',
            shape: 'circle',
            prefix: 'fa'
        });

        this.markers = [];

        this.sightMarkersUrl = "./points.geojson";

        this.currWalkNumber = 1

        this.infoDiv.style.height = window.innerHeight + 'px';
        
    }

    init() {
        this.setupMap();
        this.loadMapLayers();
        this.addTileLayer();
        this.loadWalkLayer(this.currWalkNumber);
        this.loadMaskLayer();
        this.loadSightMarkers();
        this.bindGlobalEvents();
        this.locateUser();
    }

    // init map
    setupMap() {
        var bounds = L.latLngBounds([[43.5886087, -79.4506467], [43.6905451, -79.2889900]]);
        this.map = L.map('map', {
            preferCanvas: true,
            center: [43.6425099, -79.3745239],
            zoom: 14,
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            minZoom: 13,
            maxZoom: 16
        });
        this.locationControl = L.control.locate({
            position: "topleft",
            strings: {
                title: "Locate me"
            },
            keepCurrentZoomLevel: [13, 18],
            clickBehavior: {
                inView: 'setView', 
                outOfView: 'setView', 
                inViewNotFollowing: 'setView'
            },
            setView: false
        }).addTo(this.map);

    }

    // add base tile layer
    addTileLayer() {
        this.map.createPane('basemap_pane');
        this.map.getPane('basemap_pane').style.zIndex = 250;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 16,
            updateWhenZooming: false,
            pane: 'basemap_pane'
        }).addTo(this.map);
    }

    // create and add GeoJSON layers based on config values
    loadMapLayers() {
        this.map.createPane('layers_pane');
        this.map.getPane('layers_pane').style.zIndex = 200;
        this.layerConfigs.forEach((config, i) => {
            const [url, color, weight] = config;

            // load GeoJSON layer with AJAX, style, and store reference to it in an array
            this.mapLayers[i] = new L.GeoJSON.AJAX(url, {
                style: () => ({
                    color: color,
                    weight: weight,
                    fillOpacity: 0.5,
                    opacity: 0.7
                }),
                pane: 'layers_pane'
            });

            this.mapLayers[i].addTo(this.map);

        });

    }

    // create and add GeoJSON walk path layers
    loadWalkLayer(walkNumber) {

        const url="./walk" + walkNumber + ".geojson";

        // add each layer to a new map pane, to control z-index ordering
        this.map.createPane('walk_pane');
        this.map.getPane('walk_pane').style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "#2a93ee",
                weight: 5,
                fillOpacity: 0.5,
                opacity: 0.7,
                dashArray: '5, 10'
            }),
            pane: 'walk_pane'
        });

        this.walkLayer.addTo(this.map);

    }

     // create and add GeoJSON walk mask layer to obscure areas outside city centre
    loadMaskLayer() {

        const url="./mask.geojson";

        // add each layer to a new map pane, to control z-index ordering
        this.map.createPane('mask_pane');
        this.map.getPane('mask_pane').style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "white",
                weight: 1,
                fillOpacity: 1.0,
                opacity: 1.0
            }),
            pane: 'mask_pane'
        });

        this.walkLayer.addTo(this.map);

    }   

    // create and add GeoJSON sight markers
    loadSightMarkers() {

        const url = this.sightMarkersUrl;
        const nextLayerIndex = this.mapLayers.length;

        // create pane for user location marker first, to ensure it appears below sight markers
        var paneName = 'location_pane';
        this.map.createPane(paneName);
        this.map.getPane(paneName).style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.mapLayers[nextLayerIndex] = new L.GeoJSON.AJAX(url, {
            pointToLayer: (feature, latlng) => { 
                //console.log(this.mapMarker);
                this.mapMarker.options.className = 'sight-'+feature.properties['OBJECTID'];
                var newMarker=L.marker(latlng, {
                    icon: this.mapMarker,
                    pane: paneName,
                });
                this.markers.push(newMarker);
                return newMarker;
            }, 
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    this.handleSightClick(feature, e);
                });
                this.addSightToInfoBar(feature);
            }
        });

        this.mapLayers[nextLayerIndex].addTo(this.map);

    }

    addSightToInfoBar(feature) {
        const props = feature.properties;
        var infoHtml = this.infoDiv.innerHTML;
        infoHtml += `
            <div class="marker-box" id="sight-${props['OBJECTID']}">
                <div class="marker-line">
                    <div class="marker-${props['OBJECTID']} leaflet-marker-icon extra-marker extra-marker-circle-cyan"></div>
                </div>
                <div class="marker-meta">
                    <h2>${props['SightName']}</h2>
                    <p>
                        <img src="./images/${props['SightImage']}" alt="${props['SightName']}" />
                        ${props['SightDesc']}
                    </p>
                </div>
            </div>
        `;
        this.infoDiv.innerHTML = infoHtml;
    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleSightClick(feature, e) {

        // update styles of markers in info pane, to make sure only highlighted one is orange
        const infoMarkers = document.querySelectorAll('.leaflet-marker-icon');
        infoMarkers.forEach(el => {
            if (el.classList.contains('marker-'+feature.properties['OBJECTID'])) {
                el.classList.remove('extra-marker-circle-cyan');
                el.classList.add('extra-marker-circle-orange');
            } else {
                el.classList.remove('extra-marker-circle-orange');
                el.classList.add('extra-marker-circle-cyan');
            }
        });

        // scroll to the marker in the info pane
        const sightId = 'sight-'+feature.properties['OBJECTID'];
        //document.getElementById(sightId).scrollIntoView({ behavior: 'smooth' });
        const parent = document.getElementById('info');
        const child = document.getElementById(sightId);
        parent.scrollTo({
            top: child.offsetTop - parent.offsetTop,
            behavior: 'smooth'
        });

        // set all map markers to original style
        this.markers.forEach(marker => {
            marker.setIcon(this.mapMarker);
        });

        // highlighted only the clicked marker, and zoom to it
        e.target.setIcon(this.selectedMapMarker);
        console.log(e.target);
        this.map.setView(e.target.getLatLng(), 16);

    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            this.infoDiv.style.height = window.innerHeight + 'px';
            if (this.map) this.map.invalidateSize();
        });

        this.map.addEventListener('dragstart', (e) => {
            this.map.getPane('basemap_pane').style.display='none';
        });

        this.map.addEventListener('dragend', (e) => {
            this.map.getPane('basemap_pane').style.display='block';
        });

        this.map.addEventListener('zoomstart', (e) =>     {
            this.map.getPane('basemap_pane').style.display='none';
        });

         this.map.addEventListener('zoomend', (e) =>     {
            this.map.getPane('basemap_pane').style.display='block';
        });
        
    }

    // trigger a request to determine user's current location
    locateUser() {
        this.locationControl.start();
    }

}

// init the app
const myMapApp = new MapApp();
myMapApp.init();