# OpenCode Agent Visualizer — état du projet

## Objectif

Graphe temps réel des sessions OpenCode (agent principal + subagents délégués),
affiché dans le navigateur. Nœuds = sessions, arêtes = relation parent → enfant,
couleur = statut (actif / idle / erreur).

## Architecture

```
opencode serve (port 4096)
        │  SSE event stream (@opencode-ai/sdk → client.event.subscribe())
        ▼
server.mjs (Node)                 — souscrit aux events, maintient le graphe
        │  en mémoire (Map<sessionId, node>), rebroadcast en JSON
        ▼  WebSocket (port 8787)
public/index.html                 — D3 force-directed graph, zoom/drag,
                                     colore les nœuds par statut
```

Aucune modification du core OpenCode : tout passe par le serveur headless
(`opencode serve`) + son SDK. C'est un observateur externe, pas un plugin
injecté dans OpenCode lui-même (option possible plus tard, voir "Idées").

## Fichiers

- `package.json` — deps : `@opencode-ai/sdk`, `ws`
- `server.mjs` — le seul fichier avec de la logique. Écoute les events,
  construit `nodes: Map<id, {id, parentID, title, agent, status, lastEvent}>`,
  broadcast le snapshot complet à chaque changement (pas de diff, volontairement
  simple pour l'instant)
- `public/index.html` — front autonome (D3 via CDN), une seule connexion
  WebSocket, re-render le graphe entier à chaque message reçu
- `README.md` — install/run

## Ce qui est fait

- Serveur HTTP + WebSocket qui sert le front et relaie le graphe
- Écoute de : `session.created`, `session.updated` (titre/agent/modèle/tokens
  réels, remplacent le placeholder initial), `session.idle`, `session.error`,
  `session.deleted`, `todo.updated` (todo-list native de l'agent),
  `file.edited` (fichiers touchés — voir statut "non vérifié" plus bas),
  `message.part.updated` (détection de tool call → statut "running", + stocke
  texte/tool calls par session pour le panneau de détail)
- **Préchargement au démarrage** : `client.session.list()` peuple le graphe
  avec les sessions déjà existantes au lieu de partir d'un graphe vide
- Rendu D3 : force simulation, zoom, drag des nœuds, couleur par statut
  (palette pastel clair)
- **Todo-list en nœuds satellites** autour de chaque session, avec bouton pour
  basculer entre vue "étoile" (chaque todo relié à la session — fidèle aux
  données réelles, pas de dépendances entre todos) et vue "chaîne"
  (todo[0]→todo[1]→todo[2] dans l'ordre de la liste — approximation
  cosmétique, pas une vraie donnée de dépendance)
- **Panneau de détail au clic** sur un nœud : id, agent, modèle, tokens,
  todo-list, fichiers touchés, activité (texte + tool calls)
- **VFX** : étincelles animées (CSS) sur les nœuds `running`/`in_progress`
- Reconnexion auto du WebSocket côté front si le serveur redémarre

## Ce qui N'EST PAS fait / inconnues à lever en premier

✅ **Vérifié le 2026-08-29 contre un vrai `opencode serve` 1.18.25** (Ubuntu
WSL2, provider Ollama). Deux bugs réels trouvés et corrigés :

1. `client.event.subscribe()` renvoie `{ stream }`, pas directement le
   stream — `server.mjs` faisait `const stream = await ...subscribe()` puis
   `for await (const event of stream)`, qui plantait avec `stream is not
   async iterable`. Fix : `const { stream } = await client.event.subscribe()`.
2. `@opencode-ai/sdk@^0.1.0` n'existe plus sur npm (le package est passé en
   1.x, versionné avec le CLI). Fix : `^1.18.0` dans `package.json`.

Les accès aux champs supposés (`event.properties.info`,
`event.properties.sessionID`, `session.created`/`session.idle`) sont
**confirmés corrects** contre le payload réel.

Point important **hors code**, à savoir pour tester : `opencode run --port
4096` ne s'attache PAS à un `opencode serve --port 4096` existant — `--port`
lance sa propre instance éphémère sur ce port, invisible du serveur qu'on
regarde. Il faut `opencode run --attach http://localhost:4096 "..."`.

**Subagent `parentID`** : le mécanisme marche — trouvé via `/session`
(REST) une session réelle `parentID: <session parente>` titrée
`"... (@explore subagent)"`, donc le concept central du projet (nœuds =
sessions, arêtes = parent→enfant) fonctionne bien côté OpenCode. Mais elle
n'est jamais passée par le flux SSE live qu'on regarde (elle avait tourné
avec `--port` avant qu'on découvre `--attach`, donc invisible du serveur
observé) — **reste à observer une vraie arête parent→enfant apparaître en
direct dans le graphe**, pas juste dans `/session`.

**`file.edited`** : implémenté défensivement dans `server.mjs` (le type SDK
n'annonce pas de `sessionID` sur cet event, contrairement à la plupart des
autres — fallback vers une liste "fichiers non attribués" si absent), mais
**jamais vérifié en conditions réelles** : 3 tentatives d'écriture de fichier
via `qwen2.5-coder` ont toutes échoué de la même façon (l'appel à l'outil
`write` sort en JSON texte brut au lieu d'un vrai tool call structuré — pas
un hasard, reproductible). À reverifier avec un modèle qui écrit vraiment.

Fiabilité tool-calling des modèles locaux testés (bloque plusieurs
vérifications ci-dessus) : `qwen3:8b` raisonne correctement ("il faut
appeler l'agent explore") mais n'émet parfois jamais l'appel d'outil ;
`qwen2.5-coder` (7b et 14b) hallucine des appels d'outils sur des prompts
triviaux qui n'en ont pas besoin, et échoue à formater un vrai tool call pour
`write` (le renvoie en texte).

**`num_ctx` — piste confirmée, testée le 2026-08-30** : Ollama utilise 2048
par défaut au runtime quel que soit le contexte max du modèle, sauf si le
client le précise. Config testée dans `~/.config/opencode/opencode.json` :
```json
"qwen3:8b": { "tool_call": true, "options": { "num_ctx": 8192 } }
```
Sur un prompt demandant 5 recherches `explore` en parallèle (raisonnement
~600 mots) :
- **`num_ctx` par défaut (2048)** : raisonnement complet et correct dans les
  logs, mais zéro appel d'outil — cohérent avec une troncature avant le bloc
  de function-call.
- **`num_ctx: 8192`** : 5 vrais appels au tool `task` émis (la théorie était
  juste !), mais chacun rejeté par la validation de schéma
  (`Missing key ["description"]` — champ obligatoire omis par le modèle).
- **Même config, nouvel essai** : retour à zéro appel d'outil, juste du
  raisonnement — comportement **non déterministe** d'un essai à l'autre.

Conclusion : `num_ctx` aide réellement mais ne suffit pas à rendre ce modèle
8B fiable pour du function-calling multi-appels — c'est probabiliste, pas un
bug du visualiseur. Basculer sur un provider cloud reste la façon la plus
fiable d'isoler le test du visualiseur de la fiabilité du modèle.

TODO restants par ordre d'utilité probable :

- [ ] Observer une vraie arête parent→enfant (subagent) apparaître en direct
      dans le graphe live — mécanisme confirmé fonctionnel côté OpenCode
      (vu via `/session`), jamais vu passer par le flux SSE surveillé
- [ ] Reverifier `file.edited` avec un modèle qui écrit vraiment un fichier
      (voir section ci-dessus) — determiner si `sessionID` est présent
- [ ] Garder les nœuds terminés grisés au lieu de les supprimer sur
      `session.deleted` (historique visuel de ce qui vient de se passer)
- [ ] Distinguer visuellement les agents connus (`explore`, `scout`,
      `general`) par forme/icône plutôt que juste la couleur de statut
- [ ] Gérer le cas où plusieurs `opencode serve` tournent sur des projets
      différents (actuellement le visualiseur ne pointe que sur une URL)
- [ ] Remplacer le rebroadcast "snapshot complet" par un diff (nodes
      ajoutés/modifiés/supprimés) si le graphe devient gros — pas nécessaire
      tant que c'est quelques dizaines de nœuds

## Idées si tu veux aller plus loin

- Passer par un **plugin OpenCode** (`.opencode/plugin/*.ts`) plutôt que par
  le SDK externe, pour pousser les events directement vers un WebSocket sans
  dépendre du serveur HTTP d'OpenCode — utile si tu veux embarquer ça dans
  la distribution du plugin plutôt qu'avoir un process séparé à lancer
- **Extension VSCode** : faisable, tourne sur Node comme aujourd'hui — un
  Webview hébergeant la même page, l'extension lance `opencode serve` en
  sous-process. Permettrait aussi d'afficher le vrai terminal/output de
  l'agent cliqué (dans un terminal intégré VSCode) plutôt qu'un panneau web
- Sprites pixel-art pour représenter les agents (idle/running/erreur comme
  poses différentes) plutôt que des cercles — discuté, pas commencé
- Version TUI (dans le terminal, à côté d'OpenCode) — écarté pour l'instant,
  le choix a été fait de partir sur du web

## Setup local utilisé pour les tests

- OpenCode : `npm install -g opencode-ai@latest`
- LLM local : Ollama + un modèle avec tool-calling correct (`qwen2.5-coder`
  ou supérieur — les petits modèles locaux sont peu fiables sur le
  tool-calling, c'est la cause la plus probable si un subagent ne se
  déclenche pas comme prévu)
- Provider configuré dans `~/.config/opencode/opencode.json` en pointant
  vers `http://localhost:11434/v1` (endpoint OpenAI-compatible d'Ollama)
