# OpenCode Agent Visualizer

Graphe en temps réel des sessions/subagents OpenCode : nœuds = sessions
(agent principal + subagents délégués), arêtes = relation parent → enfant,
couleur = statut (vert = actif, bleu = idle, rouge = erreur).

## Installation

```bash
cd opencode-agent-visualizer
npm install
```

## Lancer

Terminal 1 — démarrer OpenCode en mode serveur (dans le projet que tu veux observer) :

```bash
opencode serve --port 4096
```

Terminal 2 — démarrer le visualiseur :

```bash
OPENCODE_URL=http://localhost:4096 npm start
```

Puis ouvre `http://localhost:8787`. Lance tes tâches normalement dans OpenCode
(TUI, `opencode run`, etc. pointant vers ce même serveur) — le graphe se
construit tout seul au fil des events.

⚠️ Pour qu'`opencode run` envoie ses events vers le serveur `opencode serve`
que le visualiseur écoute, utilise **`--attach`**, pas `--port` (qui lance sa
propre instance éphémère, invisible du visualiseur) :

```bash
opencode run --attach http://localhost:4096 "ta tâche ici"
```

## Ce qui est fait, ce qui reste à ajuster

`server.mjs` écoute `session.created`, `session.idle`, `session.error`,
`session.deleted`, et `message.part.updated` (pour détecter l'activité d'un
outil et faire "clignoter" le nœud en actif). C'est un point de départ — la
forme exacte des payloads d'événements évolue avec les versions d'OpenCode,
donc la première chose à faire est de décommenter le `console.log(event.type,
event.properties)` dans `watchEvents()`, lancer une vraie session avec
subagents, et vérifier que `event.properties.info.parentID` (ou l'équivalent)
correspond bien à ce que le code attend. Ajuste les chemins d'accès aux champs
en conséquence.

Idées d'extension une fois que la base tourne :
- afficher le dernier tool call en label sous chaque nœud (déjà fait sommairement)
- distinguer visuellement les agents Explore/Scout/General par icône ou forme
- historique : garder les nœuds "morts" grisés au lieu de les supprimer
- fetch `client.session.list()` au démarrage pour peupler le graphe avec les
  sessions déjà existantes avant de bascule sur le flux live
