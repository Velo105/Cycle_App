// ==========================================
// Cycle Planner v0.13 - Version 21 Development 1
// ==========================================

// ---------- Map ----------

const map = L.map("map").setView([54.5, -3], 6);

const standardMapLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors"
    }
);

const cycleMapLayer = L.tileLayer(
    "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    {
        maxZoom: 20,
        attribution: "CyclOSM | © OpenStreetMap contributors"
    }
);

standardMapLayer.addTo(map);

L.control.layers(
    {
        "Standard Map": standardMapLayer,
        "Cycle Map": cycleMapLayer
    },
    null,
    {
        position: "topright",
        collapsed: true
    }
).addTo(map);

// ---------- Data ----------

let points = [];
let markers = [];
let routeLine = null;
let routePoints = [];
let routeDistance = 0;
let previewMarker = null;
let elevationDistances = [];
let routeVersion = 0;

const startIcon = L.divIcon({
    className: "start-marker",
    html: "🟢",
    iconSize: [25, 25]
});

const finishIcon = L.divIcon({
    className: "finish-marker",
    html: "🔴",
    iconSize: [25, 25]
});


// ---------- Application Modes ----------

const planModeButton = document.getElementById("planModeButton");
const recordModeButton = document.getElementById("recordModeButton");
const planPanel = document.getElementById("planPanel");
const recordPanel = document.getElementById("recordPanel");
const plannerMapElement = document.getElementById("map");

function setAppMode(mode) {
    const planning = mode === "plan";

    plannerMapElement.hidden = !planning;
    planPanel.hidden = !planning;
    recordPanel.hidden = planning;

    planModeButton.classList.toggle("active", planning);
    recordModeButton.classList.toggle("active", !planning);

    planModeButton.setAttribute("aria-pressed", String(planning));
    recordModeButton.setAttribute("aria-pressed", String(!planning));

    window.setTimeout(function () {
        if (planning) {
            map.invalidateSize();
        } else {
            ensureRecordMap();
            recordMap.invalidateSize();
        }
    }, 0);
}

planModeButton.addEventListener("click", function () {
    setAppMode("plan");
});

recordModeButton.addEventListener("click", function () {
    setAppMode("record");
});

// ---------- Status ----------

function setStatus(message) {
    document.getElementById("status").textContent = "Status: " + message;
}

// ---------- Preview Marker ----------

previewMarker = L.circleMarker([54.5, -3], {
    radius: 5,
    color: "blue",
    fillColor: "yellow",
    fillOpacity: 1,
    weight: 2
}).addTo(map);

map.on("mousemove", function (event) {
    previewMarker.setLatLng(event.latlng);
});

// ---------- Map Click ----------

map.on("click", function (event) {
    points.push(event.latlng);
    refreshMarkers();

    if (points.length >= 2) {
        updateRoute();
    }
});

// ---------- Update Route ----------

async function updateRoute() {
    const thisRoute = ++routeVersion;

    if (points.length < 2) {
        return;
    }

    const coordinates = points.map(function (point) {
        return `${point.lng},${point.lat}`;
    });

    const url =
        `https://router.project-osrm.org/route/v1/cycling/${coordinates.join(";")}?overview=full&geometries=geojson`;

    setStatus("Calculating route...");

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Routing service returned " + response.status);
        }

        const data = await response.json();

        if (thisRoute !== routeVersion) {
            return;
        }

        if (
            data.code !== "Ok" ||
            !Array.isArray(data.routes) ||
            data.routes.length === 0 ||
            !data.routes[0].geometry ||
            !Array.isArray(data.routes[0].geometry.coordinates)
        ) {
            throw new Error("No route was returned");
        }

        routeDistance = data.routes[0].distance / 1609.34;

        document.getElementById("distance").textContent =
            "Distance: " + routeDistance.toFixed(1) + " miles";

        routePoints = data.routes[0].geometry.coordinates.map(function (point) {
            return [point[1], point[0]];
        });

        if (routeLine) {
            map.removeLayer(routeLine);
        }

        routeLine = L.polyline(routePoints, {
            color: "red",
            weight: 2.5
        }).addTo(map);

        updateTime();

        if (routePoints.length > 0) {
            map.fitBounds(routeLine.getBounds());
        }

        await getElevation();
    } catch (error) {
        if (thisRoute !== routeVersion) {
            return;
        }

        console.error("Route calculation failed:", error);
        setStatus("Route unavailable");
    }
}

// ---------- Update Time ----------

function updateTime() {
    const speed = Number(document.getElementById("speed").value);

    if (!Number.isFinite(speed) || speed <= 0 || routeDistance === 0) {
        document.getElementById("time").textContent = "Time: 0h 0m";
        return;
    }

    const timeHours = routeDistance / speed;
    let hours = Math.floor(timeHours);
    let minutes = Math.round((timeHours - hours) * 60);

    if (minutes === 60) {
        hours += 1;
        minutes = 0;
    }

    document.getElementById("time").textContent =
        "Time: " + hours + "h " + minutes + "m";
}

// ---------- Refresh Markers ----------

function refreshMarkers() {
    markers.forEach(function (marker) {
        map.removeLayer(marker);
    });

    markers = [];

    if (points.length === 0) {
        return;
    }

    const start = L.marker(points[0], {
        icon: startIcon
    }).addTo(map);

    markers.push(start);

    if (points.length > 1) {
        const finish = L.marker(points[points.length - 1], {
            icon: finishIcon
        }).addTo(map);

        markers.push(finish);
    }
}

// ---------- Reset Ride Summary ----------

function resetRideSummary() {
    document.getElementById("distance").textContent =
        "Distance: 0 miles";

    document.getElementById("time").textContent =
        "Time: 0h 0m";

    document.getElementById("elevation").textContent =
        "Start: 0 ft | Highest: 0 ft | Climb: 0 ft | Descent: 0 ft";

    document.getElementById("speed").value = 15;
    setStatus("Ready");
}

// ---------- Reset Ride Data ----------

function resetRideData() {
    points = [];
    markers = [];
    routePoints = [];
    routeDistance = 0;
    elevationDistances = [];
}

// ---------- Clear Route ----------

function clearRoute() {
    // Invalidate any route or elevation request still in progress.
    routeVersion++;

    markers.forEach(function (marker) {
        map.removeLayer(marker);
    });

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    resetRideData();
    resetRideSummary();
}

// ---------- Undo Last Point ----------

function undoLastPoint() {
    if (points.length === 0) {
        return;
    }

    // Invalidate any request based on the route before the undo.
    routeVersion++;
    points.pop();
    refreshMarkers();

    if (points.length < 2) {
        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        routePoints = [];
        routeDistance = 0;
        elevationDistances = [];

        document.getElementById("distance").textContent =
            "Distance: 0 miles";

        document.getElementById("time").textContent =
            "Time: 0h 0m";

        document.getElementById("elevation").textContent =
            "Start: 0 ft | Highest: 0 ft | Climb: 0 ft | Descent: 0 ft";

        setStatus("Ready");
        return;
    }

    updateRoute();
}

// ---------- Speed Changed ----------

document.getElementById("speed").addEventListener("change", function () {
    updateTime();
});

// ---------- Export GPX ----------

function exportGPX() {
    if (points.length < 2 || routePoints.length < 2) {
        alert("Please create a route first.");
        return;
    }

    let gpx =
`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycle Planner">
<trk>
<name>Cycle Route</name>
<trkseg>
`;

    routePoints.forEach(function (point) {
        gpx += `<trkpt lat="${point[0]}" lon="${point[1]}"></trkpt>
`;
    });

    gpx +=
`</trkseg>
</trk>
</gpx>`;

    const blob = new Blob([gpx], {
        type: "application/gpx+xml"
    });

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = "CycleRoute.gpx";
    link.click();

    URL.revokeObjectURL(objectUrl);
}

// ---------- Import GPX ----------

document.getElementById("gpxFile").addEventListener("change", function (event) {
    const input = event.target;
    const file = input.files[0];

    if (!file) {
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const parser = new DOMParser();
            const xml = parser.parseFromString(e.target.result, "text/xml");

            if (xml.getElementsByTagName("parsererror").length > 0) {
                throw new Error("The GPX file is not valid XML");
            }

            const trkpts = xml.getElementsByTagName("trkpt");
            const importedRoute = [];

            for (let i = 0; i < trkpts.length; i++) {
                const latitude = parseFloat(trkpts[i].getAttribute("lat"));
                const longitude = parseFloat(trkpts[i].getAttribute("lon"));

                if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
                    importedRoute.push([latitude, longitude]);
                }
            }

            if (importedRoute.length < 2) {
                throw new Error("The GPX file does not contain a usable route");
            }

            // Invalidate any request for the previous route.
            routeVersion++;

            if (routeLine) {
                map.removeLayer(routeLine);
            }

            routeLine = L.polyline(importedRoute, {
                color: "red",
                weight: 2.5
            }).addTo(map);

            points = importedRoute.map(function (point) {
                return L.latLng(point[0], point[1]);
            });

            routePoints = importedRoute;

            refreshMarkers();
            calculateImportedDistance();
            map.fitBounds(routeLine.getBounds());
            getElevation();
        } catch (error) {
            console.error("GPX import failed:", error);
            alert("The selected GPX file could not be imported.");
            setStatus("Ready");
        } finally {
            // Allows the same file to be selected again later.
            input.value = "";
        }
    };

    reader.onerror = function () {
        alert("The selected GPX file could not be read.");
        input.value = "";
        setStatus("Ready");
    };

    reader.readAsText(file);
});

// ---------- Calculate Imported Distance ----------

function calculateImportedDistance() {
    let totalDistance = 0;

    for (let i = 1; i < points.length; i++) {
        totalDistance += points[i - 1].distanceTo(points[i]);
    }

    routeDistance = totalDistance / 1609.34;

    document.getElementById("distance").textContent =
        "Distance: " + routeDistance.toFixed(1) + " miles";

    updateTime();
}

// ---------- Get Elevation ----------

async function getElevation() {
    const thisRoute = routeVersion;

    if (routePoints.length < 2) {
        setStatus("Ready");
        return;
    }

    setStatus("Calculating elevation...");

    try {
        const samplePoints = [];
        const step = Math.max(1, Math.floor(routePoints.length / 100));

        for (let i = 0; i < routePoints.length; i += step) {
            samplePoints.push(routePoints[i]);
        }

        const finalPoint = routePoints[routePoints.length - 1];
        const sampledFinalPoint = samplePoints[samplePoints.length - 1];

        if (
            !sampledFinalPoint ||
            sampledFinalPoint[0] !== finalPoint[0] ||
            sampledFinalPoint[1] !== finalPoint[1]
        ) {
            samplePoints.push(finalPoint);
        }

        const locations = samplePoints.map(function (point) {
            return {
                latitude: point[0],
                longitude: point[1]
            };
        });

        const response = await fetch(
            "https://api.open-elevation.com/api/v1/lookup",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    locations: locations
                })
            }
        );

        if (!response.ok) {
            throw new Error("Elevation service returned " + response.status);
        }

        const data = await response.json();

        if (thisRoute !== routeVersion) {
            return;
        }

        if (!Array.isArray(data.results) || data.results.length === 0) {
            throw new Error("No elevation data was returned");
        }

        const elevations = data.results
            .map(function (point) {
                return Number(point.elevation);
            })
            .filter(function (elevation) {
                return Number.isFinite(elevation);
            });

        if (elevations.length !== samplePoints.length) {
            throw new Error("Incomplete elevation data was returned");
        }

        const highestElevation = Math.max(...elevations);
        const highestFeet = Math.round(highestElevation * 3.28084);

        elevationDistances = [];
        let total = 0;

        for (let i = 0; i < samplePoints.length; i++) {
            if (i > 0) {
                total += L.latLng(
                    samplePoints[i - 1][0],
                    samplePoints[i - 1][1]
                ).distanceTo(
                    L.latLng(
                        samplePoints[i][0],
                        samplePoints[i][1]
                    )
                );
            }

            elevationDistances.push((total / 1609.34).toFixed(1));
        }

        let climb = 0;
        let descent = 0;

        for (let i = 1; i < elevations.length; i++) {
            const change = elevations[i] - elevations[i - 1];

            if (change > 0) {
                climb += change;
            } else if (change < 0) {
                descent += Math.abs(change);
            }
        }

        const startFeet = Math.round(elevations[0] * 3.28084);
        const climbFeet = Math.round(climb * 3.28084);
        const descentFeet = Math.round(descent * 3.28084);

        document.getElementById("elevation").textContent =
            "Start: " + startFeet + " ft | " +
            "Highest: " + highestFeet + " ft | " +
            "Climb: " + climbFeet + " ft | " +
            "Descent: " + descentFeet + " ft";

        setStatus("Ready");
    } catch (error) {
        if (thisRoute !== routeVersion) {
            return;
        }

        console.error("Elevation calculation failed:", error);
        setStatus("Elevation unavailable");
    }
}


// ---------- Record Ride: Live GPS Location ----------

let recordMap = null;
let locationWatchId = null;
let liveLocationMarker = null;
let liveAccuracyCircle = null;
let recordMapCentred = false;

const showLocationButton = document.getElementById("showLocationButton");
const stopLocationButton = document.getElementById("stopLocationButton");
const gpsStatus = document.getElementById("gpsStatus");
const gpsAccuracy = document.getElementById("gpsAccuracy");

function ensureRecordMap() {
    if (recordMap) {
        return;
    }

    recordMap = L.map("recordMap").setView([54.5, -3], 6);

    const recordStandardMapLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    );

    const recordCycleMapLayer = L.tileLayer(
        "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        {
            maxZoom: 20,
            attribution: "CyclOSM | &copy; OpenStreetMap contributors"
        }
    );

    recordStandardMapLayer.addTo(recordMap);

    L.control.layers(
        {
            "Standard Map": recordStandardMapLayer,
            "Cycle Map": recordCycleMapLayer
        },
        null,
        {
            position: "topright",
            collapsed: true
        }
    ).addTo(recordMap);
}

function showLiveLocation(position) {
    ensureRecordMap();

    const point = [position.coords.latitude, position.coords.longitude];
    const accuracy = Number(position.coords.accuracy) || 0;

    if (!liveLocationMarker) {
        liveLocationMarker = L.circleMarker(point, {
            radius: 8,
            color: "#0b63ce",
            fillColor: "#2f80ed",
            fillOpacity: 1,
            weight: 3
        }).addTo(recordMap).bindPopup("You are here");
    } else {
        liveLocationMarker.setLatLng(point);
    }

    if (!liveAccuracyCircle) {
        liveAccuracyCircle = L.circle(point, {
            radius: accuracy,
            color: "#0b63ce",
            fillColor: "#2f80ed",
            fillOpacity: 0.12,
            weight: 1
        }).addTo(recordMap);
    } else {
        liveAccuracyCircle.setLatLng(point);
        liveAccuracyCircle.setRadius(accuracy);
    }

    gpsStatus.textContent = "GPS: Location active";
    gpsAccuracy.textContent = "Accuracy: approximately " + Math.round(accuracy) + " metres";

    if (!recordMapCentred) {
        recordMap.setView(point, 16);
        recordMapCentred = true;
    }
}

function handleLiveLocationUpdate(position) {
    showLiveLocation(position);

    if (typeof addRecordedRidePoint === "function") {
        addRecordedRidePoint(position);
    }
}

function handleLiveLocationError(error) {
    let message = "Unable to get location";

    if (error.code === 1) {
        message = "Location permission denied";
        gpsStatus.textContent = "GPS: " + message;
        showLocationButton.disabled = false;
        stopLocationButton.disabled = true;
        locationWatchId = null;
        return;
    }

    if (error.code === 2) {
        message = "GPS signal temporarily unavailable";
    } else if (error.code === 3) {
        message = "Waiting for GPS signal";
    }

    gpsStatus.textContent = "GPS: " + message;

    // Temporary GPS loss does not end an active ride.
    if (rideRecording) {
        showLocationButton.disabled = true;
        stopLocationButton.disabled = false;
        return;
    }

    showLocationButton.disabled = false;
    stopLocationButton.disabled = true;
}

function startLiveLocation() {
    ensureRecordMap();

    if (!navigator.geolocation) {
        gpsStatus.textContent = "GPS: Not supported by this browser";
        return;
    }

    if (locationWatchId !== null) {
        return;
    }

    gpsStatus.textContent = "GPS: Requesting permission...";
    gpsAccuracy.textContent = "Accuracy: --";
    showLocationButton.disabled = true;
    stopLocationButton.disabled = false;
    recordMapCentred = false;

    locationWatchId = navigator.geolocation.watchPosition(
        handleLiveLocationUpdate,
        handleLiveLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 15000
        }
    );
}

function stopLiveLocation() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }

    gpsStatus.textContent = "GPS: Stopped";
    showLocationButton.disabled = false;
    stopLocationButton.disabled = true;
}

showLocationButton.addEventListener("click", startLiveLocation);
stopLocationButton.addEventListener("click", stopLiveLocation);


// ==========================================
// Version 21 Dev 3 - Ride recording
// ==========================================

let rideRecording = false;
let ridePoints = [];
let rideTrackLine = null;
let rideDistanceMetres = 0;
let rideStartTime = null;
let rideTimerId = null;
let lastRidePosition = null;

const startRideButton = document.getElementById("startRideButton");
const stopRideButton = document.getElementById("stopRideButton");
const saveRideButton = document.getElementById("saveRideButton");
const clearRideButton = document.getElementById("clearRideButton");
const savedRideSelect = document.getElementById("savedRideSelect");
const loadRideButton = document.getElementById("loadRideButton");
const exportSavedRideButton = document.getElementById("exportSavedRideButton");
const rideDistance = document.getElementById("rideDistance");
const rideTime = document.getElementById("rideTime");
const rideSpeed = document.getElementById("rideSpeed");

function metresBetween(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(deltaLon / 2) *
        Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
}

function formatRideTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
}

function updateRideTimer() {
    if (!rideRecording || !rideStartTime) {
        return;
    }

    const elapsedSeconds = Math.floor((Date.now() - rideStartTime) / 1000);
    rideTime.textContent = formatRideTime(elapsedSeconds);
}

function resetRideRecording() {
    ridePoints = [];
    rideDistanceMetres = 0;
    lastRidePosition = null;
    rideStartTime = null;

    rideDistance.textContent = "0.00 miles";
    rideTime.textContent = "00:00:00";
    rideSpeed.textContent = "0.0 mph";

    if (rideTrackLine && recordMap) {
        recordMap.removeLayer(rideTrackLine);
    }

    rideTrackLine = null;
}

function startRideRecording() {
    if (typeof clearActiveRideState === "function") {
        clearActiveRideState();
    }

    ensureRecordMap();

    if (!navigator.geolocation) {
        gpsStatus.textContent = "GPS: This browser does not support location services.";
        return;
    }

    resetRideRecording();

    if (savedRideSelect) {
        savedRideSelect.value = "";
    }

    rideRecording = true;
    rideStartTime = Date.now();
    startRideButton.disabled = true;
    stopRideButton.disabled = false;
    saveRideButton.disabled = true;

    if (clearRideButton) {
        clearRideButton.disabled = true;
    }
    startRideButton.textContent = "Ride Recording";
    gpsStatus.textContent = "GPS: Ride recording started";

    if (locationWatchId === null) {
        startLiveLocation();
    }

    if (rideTimerId !== null) {
        window.clearInterval(rideTimerId);
    }

    rideTimerId = window.setInterval(updateRideTimer, 1000);
}


function stopRideRecording() {
    if (!rideRecording) {
        return;
    }

    rideRecording = false;

    if (rideTimerId !== null) {
        window.clearInterval(rideTimerId);
        rideTimerId = null;
    }

    updateRideTimer();
    rideSpeed.textContent = "0.0 mph";
    startRideButton.disabled = false;
    startRideButton.textContent = "Start New Ride";
    stopRideButton.disabled = true;
    saveRideButton.disabled = ridePoints.length === 0;

    if (clearRideButton) {
        clearRideButton.disabled = false;
    }

    gpsStatus.textContent = "GPS: Ride stopped";

    // A deliberate Stop Ride must remove unfinished-ride recovery data.
    if (typeof clearActiveRideState === "function") {
        clearActiveRideState();
    }

    // Keep the recorded track and totals visible for review.
    lastRidePosition = null;
}

function addRecordedRidePoint(position) {
    if (!rideRecording || !recordMap) {
        return;
    }

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const timestamp = position.timestamp || Date.now();
    const accuracy = Number(position.coords.accuracy);
    const point = [latitude, longitude];

    if (Number.isFinite(accuracy) && accuracy > 100) {
        gpsStatus.textContent = "GPS: Waiting for a more accurate position";
        return;
    }

    if (lastRidePosition) {
        const segmentDistance = metresBetween(
            lastRidePosition.latitude,
            lastRidePosition.longitude,
            latitude,
            longitude
        );

        if (segmentDistance >= 3 && segmentDistance <= 250) {
            rideDistanceMetres += segmentDistance;
        }
    }

    ridePoints.push({
        latitude,
        longitude,
        timestamp,
        accuracy: Number.isFinite(accuracy) ? accuracy : null
    });

    if (!rideTrackLine) {
        rideTrackLine = L.polyline([point], {
            color: "#0b63ce",
            weight: 5,
            opacity: 0.9
        }).addTo(recordMap);
    } else {
        rideTrackLine.addLatLng(point);
    }

    rideDistance.textContent = `${(rideDistanceMetres / 1609.344).toFixed(2)} miles`;

    let speedMetresPerSecond = position.coords.speed;

    if (
        (!Number.isFinite(speedMetresPerSecond) || speedMetresPerSecond < 0) &&
        lastRidePosition
    ) {
        const seconds = (timestamp - lastRidePosition.timestamp) / 1000;

        if (seconds > 0) {
            const segmentDistance = metresBetween(
                lastRidePosition.latitude,
                lastRidePosition.longitude,
                latitude,
                longitude
            );

            speedMetresPerSecond = segmentDistance / seconds;
        }
    }

    if (Number.isFinite(speedMetresPerSecond) && speedMetresPerSecond >= 0) {
        rideSpeed.textContent = `${(speedMetresPerSecond * 2.236936).toFixed(1)} mph`;
    } else {
        rideSpeed.textContent = "0.0 mph";
    }

    lastRidePosition = {
        latitude,
        longitude,
        timestamp
    };
}


function clearDisplayedRide() {
    if (rideRecording) {
        alert("Stop the ride before clearing it.");
        return;
    }

    resetRideRecording();

    if (typeof clearActiveRideState === "function") {
        clearActiveRideState();
    }

    if (savedRideSelect) {
        savedRideSelect.value = "";
    }

    startRideButton.disabled = false;
    startRideButton.textContent = "Start Ride";
    stopRideButton.disabled = true;
    saveRideButton.disabled = true;

    if (clearRideButton) {
        clearRideButton.disabled = false;
    }

    gpsStatus.textContent = "GPS: Previous ride cleared - ready";
}


if (startRideButton) {
    startRideButton.addEventListener("click", startRideRecording);
}


if (stopRideButton) {
    stopRideButton.addEventListener("click", stopRideRecording);
}

if (clearRideButton) {
    clearRideButton.addEventListener("click", clearDisplayedRide);
}


// ==========================================
// Version 21 Dev 4 - Save, recall and export rides
// ==========================================

const SAVED_RIDES_KEY = "cyclePlannerSavedRides";

function getSavedRides() {
    try {
        const stored = localStorage.getItem(SAVED_RIDES_KEY);
        const rides = stored ? JSON.parse(stored) : [];
        return Array.isArray(rides) ? rides : [];
    } catch (error) {
        console.error("Unable to read saved rides:", error);
        return [];
    }
}

function storeSavedRides(rides) {
    localStorage.setItem(SAVED_RIDES_KEY, JSON.stringify(rides));
}

function makeRideId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function refreshSavedRideList(selectedId = "") {
    if (!savedRideSelect) {
        return;
    }

    const rides = getSavedRides()
        .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    savedRideSelect.innerHTML = '<option value="">Select a saved ride</option>';

    rides.forEach((ride) => {
        const option = document.createElement("option");
        option.value = ride.id;
        option.textContent = `${ride.name} - ${new Date(ride.savedAt).toLocaleString()}`;
        savedRideSelect.appendChild(option);
    });

    if (selectedId) {
        savedRideSelect.value = selectedId;
    }
}

function calculateRideDurationSeconds() {
    if (ridePoints.length < 2) {
        return 0;
    }

    const start = Number(ridePoints[0].timestamp);
    const end = Number(ridePoints[ridePoints.length - 1].timestamp);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return 0;
    }

    return Math.floor((end - start) / 1000);
}

function saveCurrentRide() {
    if (rideRecording) {
        alert("Stop the ride before saving it.");
        return;
    }

    if (!Array.isArray(ridePoints) || ridePoints.length === 0) {
        alert("There is no recorded ride to save.");
        return;
    }

    const defaultName = `Ride ${new Date().toLocaleDateString()}`;
    const enteredName = window.prompt("Enter a name for this ride:", defaultName);

    if (enteredName === null) {
        return;
    }

    const rideName = enteredName.trim();
    if (!rideName) {
        alert("Please enter a ride name.");
        return;
    }

    const ride = {
        id: makeRideId(),
        name: rideName,
        savedAt: new Date().toISOString(),
        distanceMetres: rideDistanceMetres,
        durationSeconds: calculateRideDurationSeconds(),
        points: ridePoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
            accuracy: point.accuracy ?? null
        }))
    };

    const rides = getSavedRides();
    rides.push(ride);
    storeSavedRides(rides);
    refreshSavedRideList(ride.id);

    saveRideButton.disabled = true;
    gpsStatus.textContent = `GPS: Ride saved as "${rideName}"`;
}

function getSelectedSavedRide() {
    if (!savedRideSelect || !savedRideSelect.value) {
        alert("Select a saved ride first.");
        return null;
    }

    const rides = getSavedRides();
    const ride = rides.find((item) => item.id === savedRideSelect.value);

    if (!ride) {
        alert("The selected ride could not be found.");
        refreshSavedRideList();
        return null;
    }

    return ride;
}

function loadSavedRide() {
    const ride = getSelectedSavedRide();
    if (!ride) {
        return;
    }

    ensureRecordMap();

    rideRecording = false;

    if (rideTimerId !== null) {
        window.clearInterval(rideTimerId);
        rideTimerId = null;
    }

    if (rideTrackLine && recordMap) {
        recordMap.removeLayer(rideTrackLine);
    }

    ridePoints = Array.isArray(ride.points) ? ride.points.map((point) => ({ ...point })) : [];
    rideDistanceMetres = Number(ride.distanceMetres) || 0;
    rideStartTime = null;
    lastRidePosition = null;

    const latLngs = ridePoints.map((point) => [point.latitude, point.longitude]);

    if (latLngs.length > 0 && recordMap) {
        rideTrackLine = L.polyline(latLngs, {
            color: "#0b63ce",
            weight: 5,
            opacity: 0.9
        }).addTo(recordMap);

        recordMap.fitBounds(rideTrackLine.getBounds(), { padding: [20, 20] });
    } else {
        rideTrackLine = null;
    }

    rideDistance.textContent = `${(rideDistanceMetres / 1609.344).toFixed(2)} miles`;
    rideTime.textContent = formatRideTime(Number(ride.durationSeconds) || 0);
    rideSpeed.textContent = "0.0 mph";

    startRideButton.disabled = false;
    startRideButton.textContent = "Start New Ride";
    stopRideButton.disabled = true;
    saveRideButton.disabled = true;

    if (clearRideButton) {
        clearRideButton.disabled = false;
    }

    gpsStatus.textContent = `GPS: Loaded saved ride "${ride.name}"`;
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function makeSafeFilename(name) {
    const safe = String(name)
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_");

    return safe || "saved_ride";
}

function exportSavedRideAsGpx() {
    const ride = getSelectedSavedRide();
    if (!ride) {
        return;
    }

    if (!Array.isArray(ride.points) || ride.points.length === 0) {
        alert("The selected ride has no recorded GPS points.");
        return;
    }

    const trackPoints = ride.points.map((point) => {
        const time = new Date(Number(point.timestamp)).toISOString();
        return `      <trkpt lat="${Number(point.latitude).toFixed(7)}" lon="${Number(point.longitude).toFixed(7)}"><time>${time}</time></trkpt>`;
    }).join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cycle Planner"
     xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(ride.name)}</name>
    <time>${ride.savedAt}</time>
  </metadata>
  <trk>
    <name>${escapeXml(ride.name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${makeSafeFilename(ride.name)}.gpx`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    gpsStatus.textContent = `GPS: Exported "${ride.name}"`;
}

if (saveRideButton) {
    saveRideButton.addEventListener("click", saveCurrentRide);
}

if (loadRideButton) {
    loadRideButton.addEventListener("click", loadSavedRide);
}

if (exportSavedRideButton) {
    exportSavedRideButton.addEventListener("click", exportSavedRideAsGpx);
}

refreshSavedRideList();


// ==========================================
// Version 21 Dev 4 Final - Active ride recovery
// ==========================================

const ACTIVE_RIDE_KEY = "cyclePlannerActiveRide";

function saveActiveRideState() {
    if (!rideRecording || !Array.isArray(ridePoints) || ridePoints.length === 0) {
        return;
    }

    const activeRide = {
        savedAt: new Date().toISOString(),
        rideStartTime: rideStartTime,
        rideDistanceMetres: rideDistanceMetres,
        lastRidePosition: lastRidePosition,
        points: ridePoints.map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
            accuracy: point.accuracy ?? null
        }))
    };

    try {
        localStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(activeRide));
    } catch (error) {
        console.error("Unable to save active ride recovery data:", error);
    }
}

function clearActiveRideState() {
    try {
        localStorage.removeItem(ACTIVE_RIDE_KEY);
    } catch (error) {
        console.error("Unable to clear active ride recovery data:", error);
    }
}

function readActiveRideState() {
    try {
        const stored = localStorage.getItem(ACTIVE_RIDE_KEY);

        if (!stored) {
            return null;
        }

        const activeRide = JSON.parse(stored);

        if (
            !activeRide ||
            !Array.isArray(activeRide.points) ||
            activeRide.points.length === 0
        ) {
            return null;
        }

        return activeRide;
    } catch (error) {
        console.error("Unable to read active ride recovery data:", error);
        return null;
    }
}

function restoreActiveRide(activeRide) {
    ensureRecordMap();

    ridePoints = activeRide.points.map((point) => ({ ...point }));
    rideDistanceMetres = Number(activeRide.rideDistanceMetres) || 0;
    rideStartTime = Number(activeRide.rideStartTime) || Date.now();
    lastRidePosition = activeRide.lastRidePosition || null;
    rideRecording = true;

    if (rideTrackLine && recordMap) {
        recordMap.removeLayer(rideTrackLine);
    }

    const latLngs = ridePoints.map((point) => [
        point.latitude,
        point.longitude
    ]);

    rideTrackLine = L.polyline(latLngs, {
        color: "#0b63ce",
        weight: 5,
        opacity: 0.9
    }).addTo(recordMap);

    if (latLngs.length > 0) {
        recordMap.fitBounds(rideTrackLine.getBounds(), {
            padding: [20, 20]
        });
    }

    rideDistance.textContent =
        `${(rideDistanceMetres / 1609.344).toFixed(2)} miles`;
    updateRideTimer();
    rideSpeed.textContent = "0.0 mph";

    startRideButton.disabled = true;
    startRideButton.textContent = "Ride Recording";
    stopRideButton.disabled = false;
    saveRideButton.disabled = true;

    if (clearRideButton) {
        clearRideButton.disabled = true;
    }

    gpsStatus.textContent = "GPS: Unfinished ride restored";

    if (rideTimerId !== null) {
        window.clearInterval(rideTimerId);
    }

    rideTimerId = window.setInterval(updateRideTimer, 1000);

    if (locationWatchId === null) {
        startLiveLocation();
    }
}

function offerActiveRideRecovery() {
    const activeRide = readActiveRideState();

    if (!activeRide) {
        return;
    }

    const resumeRide = window.confirm(
        "An unfinished ride was found. Would you like to resume it?"
    );

    if (resumeRide) {
        restoreActiveRide(activeRide);
    } else {
        clearActiveRideState();
    }
}

// Save after every accepted recording update.
const originalAddRecordedRidePointForRecovery = addRecordedRidePoint;

addRecordedRidePoint = function(position) {
    originalAddRecordedRidePointForRecovery(position);

    if (rideRecording) {
        saveActiveRideState();
    }
};

// Save before Android hides or closes the page.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        saveActiveRideState();
    }
});

window.addEventListener("pagehide", saveActiveRideState);

// A deliberate Stop Ride ends recovery for that active ride.
const originalStopRideRecordingForRecovery = stopRideRecording;

stopRideRecording = function() {
    originalStopRideRecordingForRecovery();
    clearActiveRideState();
};

window.setTimeout(offerActiveRideRecovery, 300);


// ==========================================
// Version 21 Dev 5 - Block caret browsing prompt
// ==========================================

function blockCaretBrowsingShortcut(event) {
    const keyCode = event.keyCode || event.which;

    if (
        event.key === "F7" ||
        event.code === "F7" ||
        keyCode === 118
    ) {
        event.preventDefault();
        event.stopPropagation();

        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }

        return false;
    }
}

window.addEventListener("keydown", blockCaretBrowsingShortcut, true);
window.addEventListener("keyup", blockCaretBrowsingShortcut, true);
