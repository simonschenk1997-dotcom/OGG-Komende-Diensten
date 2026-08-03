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

const API_URL = "./data/services.json";

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

    el.services.innerHTML = "";
    el.empty.hidden = items.length > 0;

    let lastDay = "";

    for (const service of items) {

        const date = new Date(service.start_at);

        if (date.toDateString() !== lastDay) {
            lastDay = date.toDateString();

            const h = document.createElement("h1");
            h.className = "day-heading";
            h.textContent = dateFormatter.format(date);

            el.services.appendChild(h);
        }

        const node = el.template.content.cloneNode(true);

        node.querySelector("h2").textContent =
            service.gemeente || "Onbekende gemeente";

        node.querySelector(".metadata").textContent =
            `${timeFormatter.format(date)} · ${service.voorganger || "Voorganger onbekend"}`;

        const marker = node.querySelector(".date-marker");
        if (marker) {
            marker.innerHTML =
                `<strong>${date.getDate()}</strong>${date.toLocaleDateString("nl-NL",{month:"short"}).toUpperCase()}${date.getFullYear()}`;
        }

        const lees = node.querySelector(".leesdienst");
        if (lees) lees.hidden = !service.is_leesdienst;

        const liturgy = node.querySelector(".liturgy");
        if (liturgy) {
            if (service.liturgie) {
                const p = liturgy.querySelector("p");
                if (p) p.innerHTML = service.liturgie;
            } else {
                liturgy.hidden = true;
            }
        }

        const live = node.querySelector(".livestream");
        if (live) {
            if (service.livestream_url)
                live.href = service.livestream_url;
            else
                live.hidden = true;
        }

        const fav = node.querySelector(".favorite");

        if (fav) {

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
        }

        el.services.appendChild(node);
    }
}

async function load() {

    try {

        el.status.textContent = "Diensten laden...";

        const response = await fetch(API_URL + "?t=" + Date.now(), {
            cache: "no-store"
        });

        if (!response.ok)
            throw new Error("HTTP " + response.status);

        const data = await response.json();

        state.services = data.services || [];

        el.status.textContent =
            `${state.services.length} komende diensten`;

        render();

    } catch (err) {

        console.error(err);

        el.status.className = "status error";
        el.status.textContent = err.message;

    }
}

el.search?.addEventListener("input", render);

document.querySelector("#refresh")?.addEventListener("click", load);

document.querySelectorAll(".nav-item[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
        state.view = btn.dataset.view;
        document.querySelectorAll(".nav-item[data-view]")
            .forEach(x => x.classList.toggle("active", x === btn));
        render();
    });
});

document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const root = document.documentElement;
    const next =
        root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("ogg-theme", next);
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js");
    });
}

load();
