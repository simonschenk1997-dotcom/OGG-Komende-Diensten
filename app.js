const state = {
    services: [],
    favorites: new Set(JSON.parse(localStorage.getItem("ogg-favorites") || "[]")),
    view: "all"
};

const el = {
    services: document.querySelector("#services"),
    status: document.querySelector("#status"),
    empty: document.querySelector("#empty-state"),
    template: document.querySelector("#service-template"),
    search: document.querySelector("#search")
};

const API_URL = new URL("./data/services.json", window.location.href).href;

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
});

const serviceKey = s => `${s.station_id}-${s.start_at}`;

function saveFavorites() {
    localStorage.setItem("ogg-favorites", JSON.stringify([...state.favorites]));
}

function filteredServices() {
    const q = el.search.value.trim().toLowerCase();
    return state.services.filter(s =>
        (state.view !== "favorites" || state.favorites.has(serviceKey(s))) &&
        (!q || `${s.gemeente} ${s.voorganger} ${s.titel}`.toLowerCase().includes(q))
    );
}

function render() {
    const items = filteredServices();

    el.services.replaceChildren();
    el.empty.hidden = items.length > 0;

    let lastDay = "";

    for (const service of items) {
        const date = new Date(service.start_at);

        if (date.toDateString() !== lastDay) {
            lastDay = date.toDateString();

            const h = document.createElement("h1");
            h.className = "day-heading";
            h.textContent = dateFormatter.format(date);
            el.services.append(h);
        }

        const node = el.template.content.cloneNode(true);

        node.querySelector(".date-marker").innerHTML =
            `<strong>${date.getDate()}</strong>${date.toLocaleDateString("nl-NL",{month:"short"}).toUpperCase()}${date.getFullYear()}`;

        node.querySelector("h2").textContent = service.gemeente || "Onbekende gemeente";

        node.querySelector(".metadata").textContent =
            `${timeFormatter.format(date)} · ${service.voorganger || "Voorganger onbekend"}`;

        node.querySelector(".leesdienst").hidden = !service.is_leesdienst;

        const liturgy = node.querySelector(".liturgy");

        if (service.liturgie) {
            liturgy.querySelector("p").innerHTML = service.liturgie;
        } else {
            liturgy.hidden = true;
        }

        const live = node.querySelector(".livestream");

        if (service.livestream_url) {
            live.href = service.livestream_url;
        } else {
            live.hidden = true;
        }

        const fav = node.querySelector(".favorite");
        const key = serviceKey(service);

        fav.classList.toggle("active", state.favorites.has(key));

        fav.onclick = () => {
            if (state.favorites.has(key))
                state.favorites.delete(key);
            else
                state.favorites.add(key);

            saveFavorites();
            render();
        };

        el.services.append(node);
    }
}

async function load() {

    el.status.textContent = "Diensten laden...";

    try {

        console.log("API_URL =", API_URL);

        const response = await fetch(API_URL, {
            cache: "no-store"
        });

        console.log("HTTP STATUS =", response.status);

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const text = await response.text();

        console.log("Eerste 200 tekens:", text.substring(0,200));

        const data = JSON.parse(text);

        state.services = data.services || [];

        console.log("Aantal diensten:", state.services.length);

        el.status.textContent =
            `${state.services.length} komende diensten`;

        render();

    } catch (err) {

        console.error(err);

        el.status.textContent =
            "Kan services.json niet laden.";

        state.services = [];

        render();
    }
}

el.search.addEventListener("input", render);

document.querySelector("#refresh").onclick = load;

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.onclick = () => {
        state.view = btn.dataset.view;
        document.querySelectorAll(".nav-item[data-view]")
            .forEach(x => x.classList.toggle("active", x === btn));
        render();
    };
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js");
}

load();
