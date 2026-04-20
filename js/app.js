class MapApp {

    constructor() {

        // global references
        this.infoDiv = document.getElementById('info');
        this.infoScrollObserver;
        this.map = null;
        this.mapLayers = [];
        this.walkLayer = null;
        this.mapMarkerObjects = []; 
        this.infoElements = []; 
        this.mapElements = []; 
        this.sightContent;

        // initial map configs
        this.canvasRenderer = L.canvas({ padding: 0.5}); // buffers 0.5 of the map outside view
        this.mapInitialCenter=[43.6465378, -79.3726904];
        this.mapInitialZoom=15;
        this.mapBounds = L.latLngBounds([[43.6087473, -79.4043939], [43.6677615, -79.3401475]]);

        // map layer configs
        this.layerConfigs = [
            ["json/dissolved/green_spaces.geojson", "#adc57b", 1],
            ["json/dissolved/sidewalks.geojson", "#999999", 1],
            ["json/dissolved/water.geojson", "#91cbef", 1],
            ["json/dissolved/buildings.geojson", "#d0b38f", 1]
        ];

        // default map marker style
        this.mapMarker = L.ExtraMarkers.icon({
            markerColor: 'cyan',
            shape: 'circle',
            prefix: 'fa'
        });

        // selected map marker style
        this.selectedMapMarker = L.ExtraMarkers.icon({
            markerColor: 'orange',
            shape: 'circle',
            prefix: 'fa'
        });

        // config options for the info bar scroll observer
        this.infoScrollObserverOptions = {
            root: this.infoDiv,
            rootMargin: '2% 0px -80% 0px',
            threshold: 0
        };

        this.sightMarkersUrl = "json/points.json";
        this.sightContentUrl = "json/sights.json";
        this.currWalkNumber = 1

        this.infoDiv.style.height = window.innerHeight + 'px';
        
    }

    init() {
        this.setupMap();
        this.loadMapLayers();
        this.loadWalkLayer(this.currWalkNumber);
        this.addBasemapLayer();      
        this.loadSightContent();  
        this.bindGlobalEvents();
        this.locateUser();
        this.storeDomQueryReferences();
    }

    // init map
    setupMap() {
        this.map = L.map('map', {
            preferCanvas: true,
            center: this.mapInitialCenter,
            maxBounds: this.mapBounds,
            maxBoundsViscosity: 1.0,
            zoom: this.mapInitialZoom,
            minZoom: 15,
            maxZoom: 17
        });
        this.locationControl = L.control.locate({
            position: "topleft",
            strings: {
                title: "Locate me"
            },
            keepCurrentZoomLevel: [15, 17],
            clickBehavior: {
                inView: 'setView', 
                outOfView: 'setView', 
                inViewNotFollowing: 'setView'
            },
            setView: false
        }).addTo(this.map);

        // workaround leaflet bug to prevent click handler problems after map drag
        this.map.on('dragend', () => {
            this.map.dragging.disable();
            setTimeout(() => {
                this.map.dragging.enable();
            }, 250);
        });

    }

    // load and add geoJson map layers
    async loadMapLayers() {
        this.map.createPane('layers_pane');
        this.map.getPane('layers_pane').style.zIndex = 200;
        const layerPromises = this.layerConfigs.map(async ([url, color, weight]) => {
            const response = await fetch(url);
            const data = await response.json();
            return L.geoJSON(data, {
                style: { color, weight, fillOpacity: 0.5, opacity: 0.7 },
                pane: 'layers_pane',
                renderer: this.canvasRenderer
            }).addTo(this.map);
        });

        this.mapLayers = await Promise.all(layerPromises);
    }    

    // add base tile layer
    addBasemapLayer() {
        this.map.createPane('basemap_pane');
        this.map.getPane('basemap_pane').style.zIndex = 400;
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 16,
            updateWhenZooming: false,
            pane: 'basemap_pane',
            edgeBufferTiles: 2
        }).addTo(this.map);
    }

    // create and add GeoJSON walk path layers
    loadWalkLayer(walkNumber) {

        const url="json/walks/walk" + walkNumber + ".json";

        // add each layer to a new map pane, to control z-index ordering
        this.map.createPane('walk_pane');
        this.map.getPane('walk_pane').style.zIndex = 400;

        // load GeoJSON layer with AJAX, style, and store reference to it in an array
        this.walkLayer = new L.GeoJSON.AJAX(url, {
            style: () => ({
                color: "#2a93ee",
                weight: 7,
                fillOpacity: 0.5,
                opacity: 0.7,
                dashArray: '5, 10'
            }),
            pane: 'walk_pane'
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
        // use className option to assign a unique class to markers so they can be referenced individually later
        this.mapLayers[nextLayerIndex] = new L.GeoJSON.AJAX(url, {
            pointToLayer: (feature, latlng) => { 
                this.mapMarker.options.className = 'sight-'+feature.properties['slug'];
                var newMarker=L.marker(latlng, {
                    icon: this.mapMarker,
                    pane: paneName,
                });
                this.mapMarkerObjects.push(newMarker);
                return newMarker;
            }, 
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    this.handleMapMarkerClick(feature, e);
                });
                this.addSightToInfoBar(feature);
            }
        });
        this.mapLayers[nextLayerIndex].addTo(this.map);

    }

    async loadSightContent() {
        try {
            const response = await fetch(this.sightContentUrl);
            if (!response.ok) throw new Error('File not found');
            const sightArray = await response.json(); 
            this.sightContent = new Map(sightArray.map(sight => [sight.slug, sight]));
            this.loadSightMarkers();
        } catch (error) {
            console.error('Error loading JSON:', error);
        }
    }

    addSightToInfoBar(feature) {
        if (typeof feature.properties.slug != "undefined" && feature.properties.slug.length) {
            const sight = this.sightContent.get(feature.properties.slug);
            var infoHtml = `
                    <div class="marker-line">
                        <div class="info-marker marker-${sight.slug} leaflet-marker-icon extra-marker extra-marker-circle-cyan"></div>
                    </div>
                    <div class="marker-meta">
                        <h2 class="info-header" id="sight-${sight.slug}">${sight.name}</h2>
                        <p>
                            <img src="./images/${sight.slug}.jpg" alt="${sight.name}" />
                            ${sight.details}
                        </p>
                    </div>
            `;
            var markerDiv = document.createElement('div');
            markerDiv.className='marker-box';
            markerDiv.innerHTML= infoHtml;
            document.getElementById("info").appendChild(markerDiv);
        } else {
            console.error('Unknown slug for sight point:', error);
        }

    }

    // display clicked sight details in info bar, highlight it, and zoom to it
    handleMapMarkerClick(feature, e) {

        // update styles of markers in info pane, to make sure only highlighted one is orange
        this.mapElements.forEach(el => {
            if (el.classList.contains('marker-'+feature.properties['slug'])) {
                el.classList.remove('extra-marker-circle-cyan');
                el.classList.add('extra-marker-circle-orange');
            } else {
                el.classList.remove('extra-marker-circle-orange');
                el.classList.add('extra-marker-circle-cyan');
            }
        });
        
        // if not already at the top, scroll to the associated marker box in info pane
        const child = document.getElementById('sight-'+feature.properties['slug']);
        if (!child.classList.contains('active')) {
            this.infoElements.forEach(el => el.classList.remove('active'));
            child.classList.add('active');
            child.classList.remove('extra-marker-circle-cyan');
            child.classList.add('extra-marker-circle-orange');
            this.infoDiv.scrollTo({
                top: child.offsetTop-32
            });
        }

        // once the info bar scrolling ends, highlight the marker on the map and zoom/scroll to it
        //this.infoDiv.addEventListener('scrollend', () => {
            this.selectedMapMarker.options.className = 'sight-'+feature.properties['slug'];
            this.mapMarkerObjects.forEach(marker => {
                this.mapMarker.options.className = 'sight-'+marker.feature.properties['slug'];
                if (marker.feature.properties['slug']==feature.properties['slug']) {
                    marker.setIcon(this.selectedMapMarker);
                } else {
                    marker.setIcon(this.mapMarker);
                }
            });
            this.map.setView(e.target.getLatLng(), 16);
        //}, { once: true });

    }

    // handle global window events
    bindGlobalEvents() {

        // reset map size on window resize
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.infoDiv.style.height = window.innerHeight + 'px';
                if (this.map) this.map.invalidateSize();
                this.map.setView(this.mapInitialCenter, this.mapInitialZoom);
            }, 300);
        });

    }

    // trigger a request to determine user's current location
    locateUser() {
        this.locationControl.start();
    }

    // run DOM queries only once and store references
    storeDomQueryReferences() {
        
        // pre-query information box elements for future references
        if (!this.infoElements.length) {
            this.infoElements = document.querySelectorAll('#info .marker-box .marker-meta h2');
            if (!this.infoElements.length) {
                setTimeout(() => {
                    this.storeDomQueryReferences();
                }, 100);
                return;
            }
        }

        // pre-query map marker elements for future references
        if (!this.mapElements.length) {
            this.mapElements = document.querySelectorAll('.leaflet-marker-icon');
            if (!this.mapElements.length) {
                setTimeout(() => {
                    this.storeDomQueryReferences();
                }, 100);
                return;
            }
        }

        // only initialize info panel scroll interection observer once all required
        // elements are rendered into the DOM and pre-queried
        this.startInfoScrollObserver();

    }

     infoScrollObserverCallback = (entries) => {
        if (!this.mapElements.length) return;
        entries.forEach((entry) => {
            const child = entry.target;
            const childId = child.id;
            if (entry.isIntersecting && !child.classList.contains('active')) {
                child.classList.add('active');
                const markerToClick = document.querySelector('.leaflet-location_pane-pane .' + childId);
                if (markerToClick)  { 
                    markerToClick.click();
                } else {
                }
            } else if (!entry.isIntersecting) {
                child.classList.remove('active');  
            }
        });
    };

    // when a sight info box scrolls to the area near the top, highlight the relevant marker
    // on the map and zoom/scroll to it
    startInfoScrollObserver() {

        this.infoScrollObserver = new IntersectionObserver(this.infoScrollObserverCallback, this.infoScrollObserverOptions);

        this.infoElements.forEach(child =>  this.infoScrollObserver.observe(child));

    }

}

// init the app
const myMapApp = new MapApp();
myMapApp.init();