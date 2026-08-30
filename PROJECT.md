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
- **Nœuds en cartes rectangulaires** (coins arrondis, taille selon le type :
  session primaire / subagent / todo) reliées par des **câbles bezier**
  (arc SVG) plutôt que des cercles/lignes droites
- **Auto-cadrage de la vue** (`fitView()`, déclenché quand la simulation
  D3 se stabilise) — recentre/zoome automatiquement sur tous les nœuds,
  pour ne pas en perdre quand le graphe s'étale
- Préchargement limité à `MAX_PRELOAD_SESSIONS` (défaut : 1, la session la
  plus récente seulement) — un projet accumule vite des dizaines de
  sessions de test sans rapport entre elles, les montrer toutes au démarrage
  ne fait que noyer le graphe de points isolés
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

## Idée explorée : workflow agentic multi-phases (explore → clarification → archi → tâches)

Idée du 2026-08-30 : un outil qui ferait, avant tout code, une vraie
conversation en plusieurs phases — explore, clarification des idées avec
l'utilisateur, discussion technique/architecture, puis génération d'une
liste de tâches avec dépendances — et où le visualiseur montrerait la
progression de cette liste (tests en parallèle de l'implémentation, code
couleur par statut). Recherche faite avant de coder quoi que ce soit :

**OpenSpec** ([Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec),
MIT, Node/TypeScript, npm `@fission-ai/openspec`) : framework spec-driven
existant qui fait une partie de ça. Format réel (vérifié via la doc, pas
testé contre un vrai projet — on n'en avait pas sous la main) :
```
openspec/
├── specs/                    # état actuel du système
└── changes/<nom>/
    ├── proposal.md / design.md / tasks.md
    └── specs/
```
`tasks.md` = markdown pur, cases à cocher hiérarchiques (`- [ ] 1.1 ...`).
**Point clé : pas d'API, pas d'events** — juste des fichiers édités à la
main/par l'agent. Un fork est légalement et techniquement faisable (licence
permissive, stack accessible), mais probablement inutile : tout ce qu'on
voudrait faire (afficher la progression) est atteignable en observateur
externe pur — un watcher de fichiers (`fs.watch` sur
`openspec/changes/*/tasks.md`) + un parseur markdown, sans toucher au code
d'OpenSpec, dans le même esprit que le reste de ce projet ("aucune
modification du core"). Un fork ne se justifierait que pour faire pousser un
event *au moment précis* où OpenSpec coche une tâche, plutôt que de le
déduire d'un diff de fichier.

**Mode `plan` natif d'OpenCode** : existe réellement, et est structurellement
proche de ce qui est décrit. Vérifié en conditions réelles (`opencode run
--agent plan`) : system prompt dédié explicite ("Plan Mode — pas de
modification de fichiers"), accès aux outils `explore` (délégation
subagent), todo-list, `webfetch` ; écriture restreinte à
`.opencode/plans/*.md` (vu dans les permissions listées par
`opencode agent list`, confirmé par le comportement live). C'est une
fondation exploitable sans rien construire à partir de zéro ni forker quoi
que ce soit — mais son comportement réel (quel format de sortie, comment il
pose des questions de clarification, etc.) **n'a jamais pu être observé
jusqu'au bout**, voir plus bas.

**Blocage rencontré : fiabilité tool-calling des modèles locaux.** Sur ce
setup (Ollama, GPU 10 Go, modèles 7B–14B), 6 pannes *différentes* et
reproductibles ont été croisées au cours de cette session, sur des prompts
de complexité croissante :
1. Hallucination d'appels d'outils sur des prompts triviaux qui n'en ont pas
   besoin (`qwen2.5-coder`)
2. Non-appel silencieux — raisonnement correct, zéro tool call émis
   (`qwen3:8b`, contexte par défaut 2048 trop court)
3. Appel simulé en texte brut (`{"name": "write", ...}` comme du texte, pas
   un vrai tool call structuré) au lieu d'un vrai appel
4. Erreur de validation de schéma — champ obligatoire omis (`num_ctx: 8192`
   a débloqué l'émission de l'appel, mais pas sa validité)
5. Non-déterminisme — le même prompt, la même config, un essai qui marche
   (partiellement) et le suivant qui régresse à zéro appel
6. Appel totalement hors-sujet halluciné (mode `plan`, `qwen2.5-coder:14b` —
   a halluciné un appel `explore` sur "how do API endpoints work?", sans
   rapport avec la demande)
7. **Fabrication narrative complète du succès** (`opsx-propose`, `qwen3:8b`,
   testé le 2026-08-30) — la plus trompeuse : le modèle a répondu avec une
   sortie parfaitement plausible ("Artifact Creation Summary", noms
   d'artefacts inventés, "ready for review", invitation à lancer
   `/opsx-apply`) **sans jamais appeler `openspec new change`, ni écrire le
   moindre fichier**. `openspec/changes/` est resté vide après coup. Aucun
   moyen de détecter cette panne sans aller vérifier le disque — la sortie
   seule est indiscernable d'un vrai succès.

Conclusion (pas une supposition, un constat empirique après ~15 tentatives
sur plusieurs modèles) : valider une conversation agentic multi-phases avec
clarification + planification + délégation nécessite une fiabilité de
tool-calling que ces modèles locaux n'ont pas. Pour aller plus loin sur
cette idée, il faut soit une clé API cloud (Anthropic/OpenAI — fiabilité
suffisante quasi garantie), soit un modèle local nettement plus gros que ce
que ce GPU (RTX 3080, 10 Go VRAM) peut faire tourner.

### 🎯 Déblocage majeur (2026-08-30) : les modèles cloud gratuits d'OpenCode

`opencode models` liste, en plus des modèles Ollama configurés, des modèles
**hébergés gratuitement par OpenCode lui-même** (préfixe `opencode/`, aucune
clé API à configurer) :

```
opencode/big-pickle
opencode/ling-3.0-flash-fin-free
opencode/mimo-v2.5-free
opencode/muse-spark-1.2-contributor-free
opencode/nemotron-3-ultra-free
opencode/nemotron-3.5-lightning-free
```

⚠️ Ce sont des requêtes qui partent vers les serveurs d'OpenCode — pas privé
ni local comme Ollama, mais gratuit, sans clé à créer, et **nettement plus
fiable**.

**Testé en vrai le 2026-08-30** : rejoué le test `opsx-propose` qui avait
échoué avec `qwen3:8b` (panne #7, fabrication narrative), cette fois avec
`opencode/nemotron-3-ultra-free` :

```bash
opencode run -m 'opencode/nemotron-3-ultra-free' --attach http://localhost:4096 \
  --auto --command opsx-propose 'ajouter un mode sombre au visualiseur (fichier public/index.html)'
```

Résultat : **succès complet**. Les 4 fichiers (`proposal.md`, `specs/dark-
mode/spec.md`, `design.md`, `tasks.md`) ont été réellement écrits, avec une
todo-list de progression visible en direct dans la sortie CLI, et un
contenu de qualité nettement supérieure à tout ce que les modèles locaux
ont produit cette session : références précises et exactes à notre vrai
code (`STATUS_COLOR`/`TODO_COLOR`, `#vizToggle`, fonction `render()`,
couleurs hex exactes du thème pastel), chaque tâche de `tasks.md` respecte
la consigne "verify completion" du schema, `design.md` identifie même un
vrai risque technique subtil (les attributs SVG posés via `.attr()` par D3
ne transitionnent pas nativement en CSS).

Le modèle a aussi montré une capacité d'adaptation solide : `openspec list
--json` a échoué avec une vraie erreur d'environnement (`SyntaxError:
Unexpected token 'with'` — le binaire `openspec` a un shebang `#!/usr/bin/env
node`, et le node résolu par le shell non-interactif de l'agent est en
v18.15.0 qui ne supporte pas `import ... with { type: "json" }`, alors qu'un
shell de login normal résout v24.20.0 — écart de PATH entre les deux
contextes, pas encore corrigé) ; au lieu de s'arrêter là, le modèle a
contourné en créant les dossiers/fichiers directement avec les outils
`bash`/`write`.

**Conséquence pratique** : pour tout ce qui demande de l'orchestration
multi-étapes fiable (`opsx-propose`, et probablement plus tard le task-graph
et l'apply), préférer un modèle `opencode/*-free` à un modèle Ollama local —
gratuit, pas de setup de clé, et la fiabilité manquante qui bloquait
plusieurs chantiers cette session. Reste à tester : `opsx-apply`
(implémentation réelle), et si ces modèles gratuits ont des limites de
débit/usage à surveiller.

**Suite du 2026-08-30 : décision prise, OpenSpec plutôt que le mode `plan`
natif** — préférence explicite : OpenSpec force des points de validation
explicites (proposal → design → tasks, chacun potentiellement relu par un
humain) là où le mode `plan` laisse le modèle juger seul quand présenter un
plan. Testé en conditions réelles :

```bash
npm install -g @fission-ai/openspec@latest
openspec init --tools opencode .
```

Ça installe `openspec/config.yaml` **et** des skills/commandes OpenCode
natifs dans `.opencode/` : `opsx-propose`, `opsx-explore`, `opsx-apply`,
`opsx-archive`, `opsx-sync`, `opsx-update` (+ leurs skills correspondants).
`opsx-explore` en particulier est *exactement* l'idée de "phase explore où
le LLM pose des questions de clarification" — un skill déjà mûr : ton
curieux non-scripté, diagrammes ASCII, refus explicite d'implémenter,
confirmation obligatoire avant toute écriture.

**Testé live (`opencode run --command opsx-explore "..."`) avec
`qwen3:8b`** — et ça marche nettement mieux que le mode `plan` natif ou la
délégation parallèle : deux essais, deux réponses cohérentes avec l'esprit
du skill (questions de clarification ouvertes, ou proposition d'exécuter
`openspec list --json` en demandant confirmation d'abord). Zéro
hallucination, zéro erreur de schéma. Hypothèse qui explique la différence :
`opsx-explore` est surtout conversationnel (texte + a lu quelques fichiers +
au plus quelques appels bash simples), pas du function-calling structuré
multi-appels comme le tool `task` — la panne qu'on avait identifiée était
spécifique à *l'orchestration*, pas à la génération de texte/markdown.

Piège opérationnel trouvé au passage : **`opencode serve` doit être
redémarré après `openspec init`** pour découvrir les nouvelles commandes
`.opencode/commands/*.md` — sinon `opencode run --attach ... --command
opsx-explore` échoue avec une erreur serveur générique (`UnknownError`).

**Suite testée le 2026-08-30 : `opsx-propose` échoue, contrairement à
`opsx-explore`.** Confirme l'hypothèse posée plus haut — `opsx-propose` est
nettement plus lourd en tool-calling (plusieurs appels CLI `openspec` +
écritures de fichiers en séquence, pas juste de la conversation), et
`qwen3:8b` n'y arrive pas : voir panne #7 ci-dessus (fabrication narrative
complète, zéro fichier créé). `openspec status --json` comme flux de
progression exploitable reste donc à vérifier avec un modèle plus fiable
(cloud) avant de construire quoi que ce soit dessus.

## Vision cible (2026-08-30) — scénario idéal décrit, pas encore construit

Terminal + page web ouverts en parallèle. Le terminal pose une première
question ("qu'est-ce que tu veux faire ?"), puis enchaîne sur des questions
de clarification (référence, style graphique, techno HTML vs C++,
orientation...), peut générer des **mockups PNG** ; à chaque acceptation la
page web se met à jour avec les mockups/idées validés. Une fois cette phase
bouclée, nouvelles questions plus techniques/archi, puis génération d'une
**liste de tâches avec liens de dépendance, ordre, difficulté, méthode de
test** — visible dans le graphe, cliquable pour le détail. Sur "implémente",
les tâches passent au **vert quand leurs tests passent, rouge quand ils
échouent**.

Mapping contre ce qui existe (voir sections ci-dessus) :

| Phase | Couverte par |
|---|---|
| Question initiale + clarification | ✅ `opsx-explore`, testé, fonctionne |
| Mockups PNG + acceptation visuelle | ⚠️ génération testée en vrai le 2026-08-30 (voir plus bas — **ça marche**) ; le flow accept/reject côté web reste à construire |
| Questions techniques/archi | ✅ `opsx-propose` probablement (proposal.md/design.md) — pas encore testé en direct |
| Génération de la liste de tâches | ✅ `tasks.md` d'OpenSpec |
| Dépendances entre tâches, difficulté, méthode de test | ❌ le format `tasks.md` standard n'a que des cases à cocher numérotées hiérarchiquement (1.1, 1.2...) — aucune notion de "bloque"/"dépend de", pas de champ difficulté ni méthode de test. Nécessiterait une convention custom (ex: métadonnées par tâche) + un parseur adapté |
| Clic sur une tâche → détail | ✅ panneau de détail existant, adaptable |
| Statut vert/rouge lié aux vrais tests (pas juste coché/pas coché) | ❌ rien de natif — nécessiterait de définir comment une tâche rapporte pass/fail de ses tests (fichier, exit code, event custom à inventer) |

Décision du 2026-08-30 : documenter la vision, ne rien construire pour
l'instant (session déjà très longue). Trois chantiers distincts identifiés
pour une prochaine fois, par ordre de proximité avec l'existant :
1. Dépendances/difficulté/tests dans `tasks.md` — extension de convention +
   parseur, pas besoin de nouvel outil externe
2. Statut vert/rouge lié aux tests réels — nécessite de définir une
   convention de reporting pass/fail
3. Mockups PNG + flow d'acceptation — le plus gros morceau, nécessite un
   modèle de génération d'image (absent de ce setup) et une UI dédiée

### Chantier 3 (mockups) — génération d'image testée en vrai, ça marche

**Ollama ne sert pas les modèles de génération d'image** (diffusion), quel
que soit le modèle — c'est un stack complètement différent (ComfyUI ou
`diffusers` en Python). Qwen2.5-VL, qu'on a d'abord considéré, est un modèle
de *compréhension* d'image (image → texte), pas de génération — mauvaise
piste initiale, corrigée après recherche.

**Modèle retenu : Z-Image-Turbo** (`Tongyi-MAI/Z-Image-Turbo`, 6B, Alibaba,
nov. 2025) — choisi plutôt que Qwen-Image (20B, trop lourd) ou FLUX (need
quantization) parce qu'il tourne sans ComfyUI, juste `diffusers` :

```bash
python3 -m venv .venv-zimage && source .venv-zimage/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu124
pip install "diffusers @ git+https://github.com/huggingface/diffusers" \
  transformers accelerate sentencepiece protobuf pillow numpy
```

```python
import torch
from diffusers import ZImagePipeline

pipe = ZImagePipeline.from_pretrained(
    "Tongyi-MAI/Z-Image-Turbo", torch_dtype=torch.bfloat16, low_cpu_mem_usage=False,
)
pipe.enable_model_cpu_offload()  # marge de sécurité pour 10 Go de VRAM

image = pipe(
    prompt="...", height=768, width=768, num_inference_steps=9,
    guidance_scale=0.0, generator=torch.Generator("cuda").manual_seed(42),
).images[0]
image.save("out.png")
```

**Testé en conditions réelles le 2026-08-30** sur ce RTX 3080 (10 Go VRAM) :
génération réussie, ~9 étapes, résultat cohérent (mockup pixel-art d'un
vaisseau de shooter, sur un prompt texte simple). Poids : ~17 Go téléchargés
(HuggingFace Hub, resumable — une coupure réseau/téléchargement a réessayé
sans tout retélécharger).

⚠️ **Piège rencontré : crash disque.** Le téléchargement des poids a rempli
le disque C: de Windows (1.9 To, tombé à 159 Mo libres), ce qui a fait
planter WSL entièrement (`Wsl/Service/E_UNEXPECTED` — pas une erreur du
script). Le disque virtuel WSL (`ext4.vhdx`, typiquement dans
`%LOCALAPPDATA%\Packages\CanonicalGroupLimited.Ubuntu*\LocalState\`) grossit
dynamiquement et ne se réduit jamais tout seul — à surveiller avant tout
téléchargement volumineux (modèles Ollama + venv Python + cache HuggingFace
ont fait monter ce disque virtuel à 51 Go rien que pour cette session).
Après libération d'espace côté Windows, WSL redémarre normalement mais
**tous les process qu'il hébergeait sont perdus** (opencode serve, ollama
serve, le visualiseur) — à relancer manuellement.

Reste à faire pour ce chantier : le flow d'acceptation côté web (afficher le
mockup généré, bouton accepter/rejeter, mémoriser les idées validées).

### Comment on implémenterait le chantier 1 concrètement : ni fork ni from-scratch

Question posée et vérifiée en direct : `openspec` a un mécanisme officiel de
customisation **project-local**, distinct de forker le code source. Testé :

```bash
openspec schemas          # liste les schemas dispo (juste "spec-driven" par défaut)
openspec schema fork spec-driven task-graph
```

Ça copie `schemas/spec-driven` (dans le package npm installé) vers
`openspec/schemas/task-graph/` **dans le projet** — éditable librement, sans
toucher au package. Contenu vérifié :

- `schema.yaml` définit tout le workflow : liste des artefacts
  (proposal/specs/design/tasks), et pour chacun un champ `instruction` qui
  est **littéralement le texte de prompt donné à l'IA** pour le générer.
  L'instruction de `tasks` demande déjà "Order tasks by dependency" et
  "state how to verify completion" — donc dépendance/méthode de test sont
  déjà évoquées, mais en texte libre dans la description de la tâche, pas en
  métadonnée structurée qu'un parseur peut extraire de façon fiable.
- `templates/tasks.md` est trivial : juste `## N. <!-- ... -->` /
  `- [ ] N.M <!-- ... -->`, facile à étendre avec un format explicite, ex.
  `- [ ] 1.1 Description | depends: 1.0 | difficulty: medium | test: npm
  test foo.test.js`.

Plan (pas fait, juste vérifié faisable) : éditer l'`instruction` de `tasks`
dans `schema.yaml` pour imposer ce format structuré, éditer le template en
exemple, pointer `openspec/config.yaml` vers `schema: task-graph`, puis
écrire notre propre parseur côté visualiseur (watcher de fichiers) qui en
tire les vraies arêtes de dépendance/difficulté/test — **sans modifier le
code d'OpenSpec** : `openspec status`/`apply` ne regardent que le `- [ ]` en
début de ligne, tout ce qu'on ajoute après continue de fonctionner avec eux.
⚠️ Les commandes `schema *` sont marquées "experimental" par OpenSpec
lui-même (avertissement affiché à chaque appel) — le format peut changer.

## Idées si tu veux aller plus loin

- Passer par un **plugin OpenCode** (`.opencode/plugin/*.ts`) plutôt que par
  le SDK externe, pour pousser les events directement vers un WebSocket sans
  dépendre du serveur HTTP d'OpenCode — utile si tu veux embarquer ça dans
  la distribution du plugin plutôt qu'avoir un process séparé à lancer
- **Extension VSCode** : faisable, tourne sur Node comme aujourd'hui — un
  Webview hébergeant la même page, l'extension lance `opencode serve` en
  sous-process. **Mise à jour 2026-08-30** : OpenCode a déjà une extension
  VSCode **officielle** (`sst-dev.opencode` sur le marketplace, v0.0.13,
  >1M installs, éditeur SST — repo officiel `github.com/sst/opencode`) qui
  couvre déjà panneau latéral + **revue de diff inline** + prompts liés à la
  sélection + transcript en status bar. Il existe aussi une "OpenCode Beta"
  (`sst-dev.opencode-v2`), probablement la prochaine version — pas encore
  déterminé laquelle installer. Conséquence : pas besoin de reconstruire le
  chat/diff dans une extension à nous — juste ajouter **notre graphe/vue
  tâches en panneau compagnon** à côté de l'extension officielle. Comment
  l'extension officielle parle en interne au CLI (son propre `opencode
  serve` ? sur quel port ? découvrable ?) n'est pas documenté publiquement —
  à vérifier dans son code source avant de committer à une architecture
  précise. Sans même le savoir, notre panneau peut de toute façon lancer/
  pointer vers son propre `opencode serve` comme on fait déjà, juste affiché
  dans un Webview VSCode au lieu d'un onglet de navigateur.
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
