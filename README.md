# Savage Warrior

Bangladesh-themed, browser-based 3D fighting game (Three.js + Vite client, Node.js + Socket.IO authoritative server).

## VS Code-e run korar niyom

Requirement: **Node.js 18+** (https://nodejs.org). Project folder VS Code-e open kore terminal khulun (menu: Terminal > New Terminal).

```bash
npm install          # ekbar-i, internet lagbe
npm run dev          # shudhu game (offline bots) -> http://localhost:5173
```

Online multiplayer test korte hole client + server ekshathe:

```bash
npm start            # client (5173) + server (3001) duto-i chalu hobe
```

Ba alada duto terminal-e `npm run dev` ar `npm run server`.
Browser-e `http://localhost:5173` open korun. Same WiFi-te onno device theke `http://<your-pc-ip>:5173` diye join kora jay.

## Controls

| Key | Kaj |
|---|---|
| W A S D | move |
| Mouse | look (screen-e click korle mouse lock hobe) |
| Left click / J | punch (combo chain, max +30% damage). Gun equip thakle Left click = fire, `J` tokhon-o punch |
| E / K | kick |
| Q / L | shockwave (8s cooldown) |
| Right click / F | block (front damage -85%, stamina khay) |
| V | dodge dash (invulnerable) |
| Shift / Space | sprint / jump |
| T | first-person arms view <-> third-person |
| Enter | (eliminated hole) result-e jaon |
| Esc | pause |

Mobile/touch: on-screen joystick, look zone ar button pabe.

## Gameplay
- 4 class: Warrior, Assassin, Tank, Ranger (stats proposal-er moto).
- Modes: Solo (6 fighters), Duo (3 teams x 2), Squad (3 teams x 3 = 9 fighters).
- 5 map: Sirajganj, Old Dhaka, Sundarbans, Sylhet, Cox's Bazar.
- Counter-crit: enemy attack wind-up-er shomoy hit korle 1.5x damage + interrupt.
- 5 minute match; time shesh hole "Time Up". XP: elimination, damage, victory.
- Player arms: third-person-e full-body articulated arms; `T` chap-le first-person (PUBG style) arms + fists + kick leg dekha jay.

## Map objectives (notun)
Prottek map-e 2 dhoroner objective ache. Minimap-e sob dekha jay (sobuj/neel/komla boxes = pickup, rong-er ring = control zone).

| Objective | Ki kore |
|---|---|
| **Ilish Feast** (sobuj) | +40 HP. HP full thakle neya jay na. 28s-e respawn. |
| **Cha Boost** (neel) | Stamina full + 25% speed, 8 second. 25s-e respawn. |
| **Jamuna Fury** (komla) | +30% damage, 10 second. Match-er 15s por thekei spawn hoy, 40s respawn. |
| **Control Zone** (Sirajganj-e *Bazar Chowk*) | Ekdol ekla zone-er bhitore thakle HP regen (3/s) + 6 second-e 1 point (+15 XP). Ar ekdol dhukle "CONTESTED". |

Bots-rao pickup ar zone-er dike jay (HP kom hole health pickup-e).

## Sirajganj map (tomar chhobi dekhe design kora)
Arena 170x170. Pochhim = Sirajganj shohor ar gram, purbo = Jamuna-r opar. Chhobi theke ja neya hoyeche:

| Chhobi | Map-e ki ache |
|---|---|
| Terracotta mondir | **Terracotta Temple**: lal ita-r mondir, arch-er barandah, upor-er tola, kone gol turret, uchu plinth. Ilish Feast (health) plinth-er samne. |
| Jamuna riverside | **Riverside Park**: gulabi ita-r footpath, lal-holud bollard, sada railing, sobuj ghas, boro rain-tree, sobuj chhata-r cha stall. Health pickup ekhane. |
| Jamuna Bridge | **Bangabandhu Jamuna Bridge**: concrete barrier, holud majher line, bnaka lomba street lamp. Main chokepoint. |
| Chowk + CNG chhobi | **Bazar Chowk** (control zone): khola junction, majhe bishal rain-tree + railing divider, sobuj CNG, rickshaw, billboard, purano holud building. |
| Rail station (4 ta chhobi) | **Rail Station**: bali-r yard, dui track, moroon V-brace overhead mast, lal steel canopy + neel chhad platform, halka-neel station building, sobuj-komla mosque, rongin chhata-r cha stall, train. Platform-e Cha Boost pickup. |

Baki: Jamuna char (Jamuna Fury), bamboo footbridge, Hard Point (geo-bag + launch), Shaheed Minar, Tant Palli (handloom shed), gram (mosque, pukur, paddy, pat, kola), Economic Zone (nodir purbo par).
Spawn: solo-te 6 ta, duo/squad-e 3 ta fixed jayga, shob jayga check kora (kono obstacle/pani-te na).

Map-er data: `shared/maps.js` (function `sirajganj`), 3D prop: `src/world.js`, objective rules: `shared/sim.js` (`_objectives`) ar `shared/config.js` (`PICKUPS`, `OBJ` - ekhane number change korlei balance bodlay).

## Mini Royale systems (Savage Warrior-er bhitore merge kora, alada mode na)
Mini Royale-er game concept ekhon Savage Warrior-er prottek match-er bhitore ache. Fist/melee fighting, 4 ta class, 5 ta map, Solo/Duo/Squad, bots, online, Sirajganj map sob ager moto-i ache. Notun jinis gulo:

| Feature | Kemon kaj kore |
|---|---|
| **Guns** (Mini Royale-er number) | Pistol (SEMI), AR (AUTO), Shotgun (PUMP, 7 pellet). Damage/fire rate/mag/reserve/reload/spread/ADS Mini Royale theke. Shobai pistol niye shuru kore, AR ar Shotgun loot theke pabe. Default weapon hocche **Fists**, tai v3-er fighting hubohu ager moto. |
| **Shield** | 50 shield niye shuru (max 100). Shield age damage soke, tarpor HP. Melee, gun, grenade, storm sob-er jonno. |
| **Grenades** | 2 ta niye shuru. 2.5s fuse, bounce kore, radius 7. Nijer/teammate-er grenade-e kom damage. |
| **Loot** (ekbar-i pabe) | Walk-over pickup: +30 HP, +25 Shield, ammo, +1 grenade, AR crate, Shotgun crate. Minimap-e dot dekha jay. Map-prti ~30 ta. |
| **Shrinking storm** (5 phase) | Lal deyal ar ground ring. Phase 1: 40s por shrink shuru, last phase-e r=8. Bahire thakle (2 + phase) damage/sec, shield age. Shada ring = porer safe zone. Bot-rao safe zone-er dike jay. |
| **HUD** | Shield bar, weapon panel + hotbar, ammo (low hole lal), reload bar, nades, kills, stance, **compass** (N/NE/...), zone timer, "OUTSIDE SAFE ZONE" warning, damage-direction arrow, red aim-lock ring, ADS vignette. |
| **Minimap** | Storm ring, next zone, loot, grenade, FOV cone. `M` chepe **Fixed** (puro arena) / **Rotating** (tomar dik-er sathe ghure) toggle. Lobby settings-eo ache. |
| **Crouch / ADS / Recoil** | `C` crouch (slow, kom spread, low cover-er pichone lukano jay). Gun-e Right click = ADS (zoom + kom spread). Gun-er recoil camera-e lage. |
| **Mobile (PWA)** | Fire, ADS, Duck, Reload, Nade, Run buttons + weapon hotbar. Gear button diye **button layout editor**: jekono button drag kore SAVE. Portrait-e "Rotate device" prompt. Installable PWA (manifest + offline service worker). |

### Notun controls
| Key | Kaj |
|---|---|
| 1 / 2 / 3 | Pistol / AR / Shotgun (jodi pao). 4 = Fists |
| Left click | Gun hole **fire** (AUTO-te dhore rakho), Fists hole punch |
| Right click | Gun hole **ADS**, Fists hole block. `F` always block, `J` always punch, `E` kick, `Q` shockwave |
| R | Reload |
| G | Grenade |
| C | Crouch |
| M | Minimap Fixed / Rotating |

Loot pickup-e E lagbe na (E = kick), upor diye hete gelei hoy.

### Balance-er number kothay
`shared/config.js`-er `GUNS`, `GUN` (damage scale 0.3, bot damage 0.7x, shield), `NADE`, `LOOT`, `STORM`. Shob gun logic `shared/sim.js`-e (offline + server-e same code, tai cheat-proof). Loot jayga `shared/maps.js`-er `genLoot`.

Note: Mini Royale-er logo/icon-e "MINI ROYALE" lekha, tai Savage Warrior-er jonno alada icon (`public/icons`) banano hoyeche.

## City Combat update (v5)
Ager sob kichu (fighting, 4 class, 5 map, Solo/Duo/Squad, bots, online, Sirajganj map, Mini Royale systems) ager moto-i ache. Notun jinis:

### Metro City map (6th map, alada mode na)
Bishal modern city: downtown tower, market, residential block, industrial yard, city park, central plaza (control zone), parked car, police car, barrier, sandbag, dumpster, container, streetlight, crosswalk, fountain. **Size: Small (170) / Medium (260) / Large (380)**. Lobby > Match settings theke size dao.
- Day/night cycle: match-er shuru-te sokal, shesh-e sondhya/rat. Rate-e window jole, streetlight jole, police siren jhalamal kore, tara ahse. Ambient: traffic, car, siren, horn.
- Texture: facade, asphalt, pavement sob code diye generate (colour map + bump map + lit window map), kono image file lage na.

### Weapons (5 type, sob-ar alada stats)
| Key | Gun | Mode | Sight / zoom (Z ba wheel) |
|---|---|---|---|
| 1 | M9 Pistol | semi | red dot 1.25x |
| 2 | AR | auto / semi (B) | red dot 1.4x -> 2x scope -> 4x scope |
| 3 | Shotgun | pump (7 pellet) | red dot 1.1x |
| 5 | SMG | auto / semi (B) | red dot 1.25x -> 2x scope |
| 6 | Sniper | bolt | 2x -> 4x -> 8x scope, headshot = instant kill |
| 4 | Fists | | melee ager moto |

Prottek gun-er alada: damage, fire rate, range, mag, reload time, recoil (upor + dan-bam), spread, bloom, bullet speed, headshot multiplier (`GUNS` in `shared/config.js`). Alada **reload / equip / pump (shotgun) / bolt (sniper) animation** (first person + third person) ar alada sound.

### Damage system
- Hitscan, kintu bullet **ballistic arc** e jay (**bullet drop**): dur-e target-er upor-e aim korte hoy.
- **Hit zone**: head (x2.0..x6.0, gun bhede), body (x1), leg (x0.7). Matha-r cylinder alada tai accurate.
- **Damage falloff**: range-er por damage komte thake kintu **kokhono zero hoy na**.
- Hit-marker (headshot hole lal ar boro), floating damage, blood/impact particle, tracer, muzzle flash, recoil.

### Scope / ADS
Right click = aim. Sniper-e scope overlay + crosshair + mil dots + sway (crouch korle kom). Wheel / `Z` diye 2x, 4x, 8x. Zoom-e mouse sensitivity kome. Red dot (pistol/AR/SMG) halka zoom. Scope-e thaka obosthay camera first-person hoye jay.

### Loot
- **Shotru mara gele loot crate** drop kore (gun, ammo, medkit, grenade, armor). Kache giye `X` chepo (touch-e Pick button).
- `H` = medkit (2s lage, +50 HP, hit hole interrupt hoy). `Tab` = inventory panel.
- Map-e ager moto loot ache (walk-over), notun item: medkit, armor, SMG, sniper.

### Grenade
`G` dhore rakho: **throw arc** (dotted line + landing ring) dekha jay, chhare dile chhure. Blast radius-e damage doori onujayi kome. Explosion VFX, screen shake, sound, **ragdoll** (shotru uriye jay, deyale dhakka khay, ghure pore, prottek hat-pa spring joint-er moto nare). Same physics server-e.

### Match settings (Lobby > Match settings)
Duration 5 / 10 / 15 min / Unlimited, bots 1-14 (Auto = mode default), difficulty, map size. Timer HUD-e. Time sesh hole **VICTORY / DEFEAT** screen. Storm-er speed match-er duration-er sathe scale kore; Unlimited-e final circle dhire dhire chhoto hoy (stalemate hoy na). **Offline ar **online** dui-tei kaj kore (online-e ekoi setting-er player-der ekoi room-e match kora hoy).**

### Menus
Pause: Resume / Settings / Restart / Exit to Main Menu / Quit Game. Restart, Exit, Quit ar online matchmaking cancel-er age confirm dialog. Death/result screen-e **Return to Lobby**. Setting sob automatic save hoy (localStorage), profile/XP match-er pore.

### Performance
- Dynamic resolution: frame slow hole render resolution kome (min 55%), fast hole barhe. `F3` = FPS counter.
- Shadow texel snapping (shadow jhilmil kore na), TPS camera deyal-er bhitor dhoke na (camera wall collision).
- City static geometry material + 64-unit chunk onujayi merge: frustum culling, **distance LOD** (dur-e shudhu deyal + chhad, chhoto prop hide), **software occlusion culling** (boro building-er pichone lukano chunk draw hoy na; on/off screenshot pixel-diff-e kono visible building lukay ni).
- Normal map (Sobel diye height theke), 512px texture, PBR material (shob 6 map-e), tiling ground detail.

## Ja ekhono nei (shotti kotha)
Browser-e kono download kora asset chhara chalano hocche, tai: Call of Duty-r moto AAA realistic graphics (skinned/rigged human model, motion-capture animation, scanned PBR texture, baked global illumination / lightmap, ray tracing) **possible na**. Character-gulo blocky style-ei ache (chokh blink kore, mukh khole, byatha-y bhru kunchoy). Building-er bhitore dhoka jay na, rooftop-e hata jay na. Ragdoll simple spring-joint (full rigid-body physics na). 60 FPS device-er upor nirbhor: game resolution auto-kome, kintu kono guarantee deya jay na.

## Optional: Google login + cloud profile (Firebase)
Na korleo game kaj kore (guest mode + local XP).
1. https://console.firebase.google.com -> project create -> **Authentication -> Google** enable.
2. **Firestore Database** create, `firestore.rules` file-er rules paste korun.
3. Web app add korun, config-er value `.env` file-e din (`.env.example` copy kore):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
4. Server-e token verify korte: `FIREBASE_PROJECT_ID=your-project-id npm run server`
   (Windows PowerShell: `$env:FIREBASE_PROJECT_ID="your-project-id"; npm run server`).

## Deploy
- GitHub Pages: push to `main`; GitHub Actions builds and publishes the client at `https://smanik0002.github.io/Savage-Warrior-/`. The Pages version supports offline play with bots; online multiplayer needs a separately hosted server configured with `VITE_SERVER_URL`.
- Client: `npm run build` -> `dist/` folder static hosting-e (Netlify, Firebase Hosting, Vercel...).
- Server: `server/index.js` + `shared/` folder shoho ekta chhoto cloud VM/Render/Railway-e `node server/index.js`. Client-er `.env`-e `VITE_SERVER_URL=https://your-server` din.

## Folder structure
```
index.html            UI markup
src/main.js           lobby, profile, online/offline flow
src/game.js           render loop, camera, offline sim, online interpolation
src/fighter.js        humanoid model, arms animation, first-person arms viewmodel
src/world.js          3D map builder (merged geometry = fast on low-end PCs)
src/audio.js          procedural sound + 3D spatial audio + music
src/touchlayout.js     draggable mobile button layout editor
src/city.js           Metro City renderer: textures, buildings, cars, lights, chunk culling
src/effects.js        sparks, bullet tracers, grenade explosions
public/               PWA manifest, service worker, icons
src/input.js          keyboard, mouse, touch
src/ui.js, style.css  HUD, minimap, result screen
src/auth.js, net.js   Firebase + Socket.IO client
shared/               sim.js (combat/bots/rules), maps.js, config.js  <- client ar server duto-i use kore
server/index.js       authoritative multiplayer server
```

## Notes
- Sim 60 Hz, server snapshot 20 Hz. Client others-der 100 ms interpolate kore; nijer character extrapolation + smoothing. Full client-side prediction/reconciliation stretch goal.
- Online room: 10 second wait, tarpor khali slot bot diye fill. Player disconnect hole bot take over kore.
- Cloud profile-er XP client theke likha hoy (student project-er jonno thik); serious anti-cheat-er jonno Cloud Function-e move korben.
