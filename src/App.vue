<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { useOwlbear } from './composables/useOwlbear';
import { type StatName, type WeaponType, getRankFromXp, SPECIES_DATA } from './types/character';
import OBR from '@owlbear-rodeo/sdk';
import draggable from 'vuedraggable';

// Importation des icônes propres depuis Lucide (avec CheckCircle2 et XCircle)
import {
	ScrollText,
	Dices,
	Lock,
	Leaf,
	Sparkles,
	Wrench,
	Shield,
	Heart,
	Zap,
	Bone,
	Skull,
	HelpCircle,
	X,
	Plus,
	Key,
	Coins,
	Backpack,
	Star,
	Sword,
	Wand2,
	Award,
	Play,
	ChevronDown,
	ChevronUp,
	Minus,
	MessageCircle,
	Crown,
	Eye,
	Trash,
	ArrowLeft,
	ArrowRight,
	Activity,
	PersonStanding,
	ShieldX,
	GripVertical,
	BookOpenText,
} from 'lucide-vue-next';

// Gestion des largeurs de la pop-over OBR pour le mode split (Fiche + Chat)
const POPOVER_WIDTH_NORMAL = 620;
const POPOVER_WIDTH_SPLIT = 900;

const isChatDetached = ref(false);
const chatPosition = ref<'left' | 'right'>('left');

const isOpenEquipped = ref(true);
const isOpenStats = ref(true);

async function toggleDetachChat() {
	isChatDetached.value = !isChatDetached.value;
	if (isChatDetached.value) {
		activeTab.value = 'sheet';
		await OBR.action.setWidth(POPOVER_WIDTH_SPLIT);
	} else {
		await OBR.action.setWidth(POPOVER_WIDTH_NORMAL);
	}
	await scrollToBottom();
}

function toggleChatPosition() {
	chatPosition.value = chatPosition.value === 'right' ? 'left' : 'right';
}

// Onglet principal
const activeTab = ref<'sheet' | 'roller' | 'logs' | 'help' | 'chat' | 'gm-dashboard'>('sheet');

// Sous-onglets internes de la fiche
const activeSubTab = ref<'favorites' | 'weapons' | 'spells' | 'armors' | 'masteries' | 'feats' | 'inventory'>(
	'favorites',
);

export interface SubTabItem {
	id: 'favorites' | 'inventory' | 'weapons' | 'spells' | 'armors' | 'masteries' | 'feats';
	label: string;
	isFav?: boolean;
}

// Ordre par défaut des sous-onglets
const DEFAULT_SUBTABS: SubTabItem[] = [
	{ id: 'favorites', label: 'Favoris', isFav: true },
	{ id: 'inventory', label: 'Sac', isFav: false },
	{ id: 'weapons', label: 'Armes', isFav: false },
	{ id: 'spells', label: 'Sorts', isFav: false },
	{ id: 'armors', label: 'Armures', isFav: false },
	{ id: 'masteries', label: 'Maîtrises', isFav: false },
	{ id: 'feats', label: 'Dons', isFav: false },
];

// Computed property avec Getter / Setter pour gérer le v-model du drag-and-drop des sous-onglets
const orderedSubTabs = computed<SubTabItem[]>({
	get() {
		if (!sheet.value) return DEFAULT_SUBTABS;
		// Si un ordre personnalisé est enregistré dans la fiche, on l'utilise
		if (sheet.value.subTabOrder && Array.isArray(sheet.value.subTabOrder)) {
			const savedOrderIds: string[] = sheet.value.subTabOrder;
			const sorted = [...DEFAULT_SUBTABS].sort((a, b) => {
				const indexA = savedOrderIds.indexOf(a.id);
				const indexB = savedOrderIds.indexOf(b.id);
				if (indexA === -1) return 1;
				if (indexB === -1) return -1;
				return indexA - indexB;
			});
			return sorted;
		}
		return DEFAULT_SUBTABS;
	},
	set(newTabs) {
		if (!sheet.value) return;
		// Sauvegarde de l'ordre des IDs dans la fiche de personnage
		sheet.value.subTabOrder = newTabs.map((tab) => tab.id);
		saveSheet();
	},
});

// Helper pour afficher les compteurs d'éléments à côté du nom de l'onglet
function getSubTabCount(tabId: string): string {
	if (!sheet.value) return '';
	switch (tabId) {
		case 'inventory':
			return ` (${sheet.value.inventory?.length || 0})`;
		case 'weapons':
			return ` (${sheet.value.weapons?.length || 0})`;
		case 'spells':
			return ` (${sheet.value.spells?.length || 0})`;
		case 'armors':
			return ` (${sheet.value.armors?.length || 0})`;
		case 'feats':
			return ` (${sheet.value.feats?.length || 0})`;
		default:
			return '';
	}
}

// Gestion des descriptions dépliées dans l'onglet favoris (Stocke les états par ID unique)
const expandedFavorites = ref<Record<string, boolean>>({});

function toggleFavoriteDesc(id: string) {
	expandedFavorites.value[id] = !expandedFavorites.value[id];
}

// Paramètres du lanceur de dés libre
const customRollMode = ref<'normal' | 'advantage' | 'disadvantage'>('normal');
const customBonus = ref<number>(0);
const customLabel = ref<string>('');
const isRollSecret = ref<boolean>(false);

const {
	isReady,
	isGM,
	canEdit,
	sheet,
	knownPlayers,
	currentSpeciesData,
	estimatedHpMax,
	estimatedPeMax,
	dodgePenalty,
	protectionPenalty,
	corruptionStatus,
	chatMessages,
	partySheets,
	currentSheetTokenId,
	availableTokens,
	isLoadingSheet,
	init,
	saveSheet,
	rollStatCheck,
	rollWeaponAttack,
	rollWeaponDamage,
	rollSpellCast,
	rollSpellEffect,
	rollCustomDice,
	addWeapon,
	removeWeapon,
	addArmor,
	removeArmor,
	addSpell,
	removeSpell,
	addFeat,
	removeFeat,
	addInventoryItem,
	removeInventoryItem,
	toggleWound,
	updateHp,
	updatePe,
	toggleOwner,
	handleUseConsumable,
	executeFormulaRoll,
	sendChatMessage,
	deleteMetadata,
	saveCharacter,
	focusAndSelectToken,
	dodgePenaltyChar,
	protectionPenaltyChar,
	changeActiveToken,
	initializeTokenSheet,
	exportCharacterSheet,
	importCharacterSheet,
} = useOwlbear();

const statLabels: Record<StatName, string> = {
	force: 'Force',
	dexterite: 'Dextérité',
	intellect: 'Intellect',
	sagesse: 'Sagesse',
};

const weaponList: WeaponType[] = ['Epee', 'Dague', 'Arc', 'Masse', 'Lance', 'Magie', 'Hache', 'Poing'];

const customDiceCount = ref(1);
const customFormulaInput = ref('');

// Mise à jour de la fonction d'exécution du jet si tu passes la quantité de dés
async function executeCustomRoll(diceType: number) {
	// Transmet le nombre de dés (customDiceCount.value), le type, le mode et le bonus à useOwlbear()
	await rollCustomDice(
		diceType,
		customRollMode.value,
		customBonus.value,
		customLabel.value,
		isRollSecret.value,
		customDiceCount.value,
	);
}

const newChatMessage = ref('');
const isChatWhisper = ref(false);
const chatScrollContainer = ref<HTMLElement | null>(null);

// 1. Dictionnaire des commandes supportées
const AVAILABLE_COMMANDS = [
	{
		name: '/roll',
		syntax: '/roll [--message "Message"] <formule>',
		description: 'Lancer de dé standard (respecte les options de masquage actuelles).',
		example: '/roll --message "Attaque" 2d6+3',
	},
	{
		name: '/r',
		syntax: '/r [--message "Message"] <formule>',
		description: 'Alias pour /roll.',
		example: '/r -m "Attaque" 1d20+5',
	},
	{
		name: '/gr',
		syntax: '/gr [--message "Message"] <formule>',
		description: 'Lancer de dé secret (uniquement visible par le MJ).',
		example: '/gr -m "Furtivité" 1d20',
	},
	{
		name: '/pr',
		syntax: '/pr [--message "Message"] <formule>',
		description: 'Lancer de dé public (visible par tous les joueurs).',
		example: '/pr 1d100',
	},
	{
		name: '/gm',
		syntax: '/gm <message>',
		description: 'Envoyer un message chuchoté au MJ.',
		example: "/gm J'essaie de voler la bourse du PNJ.",
	},
];

// Index de la suggestion sélectionnée avec le clavier (flèches Haut/Bas)
const selectedSuggestionIndex = ref(0);
const selectedSuggestionRef = ref(null);

// 2. Computed property pour filtrer la liste en direct
const filteredCommands = computed(() => {
	const text = newChatMessage.value.trim();

	// On n'affiche la liste que si le message commence par '/'
	if (!text.startsWith('/')) {
		return [];
	}

	// Extrait le premier mot (ex: '/g' ou '/r')
	const firstWord = text.split(' ')[0].toLowerCase();

	return AVAILABLE_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(firstWord));
});

// 3. Sélectionner une commande depuis la liste (au clic ou sur la touche Entrée)
function selectCommand(cmd: (typeof AVAILABLE_COMMANDS)[0]) {
	const text = newChatMessage.value;
	const spaceIndex = text.indexOf(' ');

	if (spaceIndex !== -1) {
		// Si l'utilisateur avait déjà commencé à écrire des arguments (ex: "/r 1d20"),
		// on remplace juste le préfixe de la commande
		newChatMessage.value = `${cmd.name}${text.substring(spaceIndex)}`;
	} else {
		// Sinon on insère la commande avec un espace à la fin pour préparer la saisie
		newChatMessage.value = `${cmd.name} `;
	}

	// Remet le focus sur l'input de chat (optionnel)
	const inputEl = document.querySelector('.chat-input') as HTMLInputElement;
	if (inputEl) inputEl.focus();
}

async function scrollToActiveSuggestion() {
	await nextTick(); // Attend que le DOM soit mis à jour avec la nouvelle classe 'active'
	const container = selectedSuggestionRef.value;
	if (!container) return;

	const activeItem = (container as HTMLElement).querySelector('.suggestion-item.active') as HTMLElement;
	if (activeItem) {
		activeItem.scrollIntoView({
			block: 'nearest', // Ne défile que le strict nécessaire pour amener l'élément dans la zone visible
			behavior: 'smooth', // Optionnel : transition fluide (tu peux mettre 'auto' pour un scroll instantané)
		});
	}
}

// 4. Navigation au clavier (Flèches Haut, Bas, Entrée, Échap)
async function handleKeydown(event: KeyboardEvent) {
	if (filteredCommands.value.length === 0) return;

	if (event.key === 'ArrowDown') {
		event.preventDefault();
		selectedSuggestionIndex.value = (selectedSuggestionIndex.value + 1) % filteredCommands.value.length;
		await scrollToActiveSuggestion();
	} else if (event.key === 'ArrowUp') {
		event.preventDefault();
		selectedSuggestionIndex.value =
			(selectedSuggestionIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
		await scrollToActiveSuggestion();
	} else if (event.key === 'Tab') {
		// Si la liste est ouverte et qu'on n'a entré QUE le préfixe de commande, valider la suggestion
		const text = newChatMessage.value.trim();
		if (!text.includes(' ') && filteredCommands.value[selectedSuggestionIndex.value]) {
			event.preventDefault();
			selectCommand(filteredCommands.value[selectedSuggestionIndex.value]);
		}
	} else if (event.key === 'Escape') {
		// Fermer le menu en retirant le / ou en réinitialisant
		selectedSuggestionIndex.value = 0;
	}
}

function handleChatRoll(content: string, label: string) {
	// Regex pour capturer -m "..." ou --message "..." ou sans guillemets s'il n'y a pas d'espaces
	const labelRegex = /(?:-m|--message)\s{0,}(?:"([^"]+)"|'([^']+)'|(\S+))/i;
	const matchLabel = content.match(labelRegex);

	if (matchLabel) {
		// Récupère la valeur capturée avec ou sans guillemets
		label = matchLabel[1] || matchLabel[2] || matchLabel[3] || '';
		// Supprime la partie libellé pour ne garder que la formule de dés
		content = content.replace(labelRegex, '').trim();
	}

	return { content, label };
}

async function handleSendChat() {
	if (!newChatMessage.value.trim()) return;

	if (newChatMessage.value.startsWith('/')) {
		// Retire le préfixe de commande
		let contentInitial = newChatMessage.value.trim().replace(/^\/[a-z]*\s+/, '');

		let labelInitial = '';

		if (newChatMessage.value.startsWith('/gm')) {
			await sendChatMessage(contentInitial, true);
		} else if (newChatMessage.value.startsWith('/r') || newChatMessage.value.startsWith('/roll')) {
			const { content, label } = handleChatRoll(contentInitial, labelInitial);

			// execute un lancer (automatiquement masquer si le chat OU option masquer mes lancer sont activer)
			await executeFormulaRoll(content, label, isChatWhisper.value || isRollSecret.value);
		} else if (newChatMessage.value.startsWith('/gr')) {
			const { content, label } = handleChatRoll(contentInitial, labelInitial);

			// execute un lancer uniquement pour le GM
			await executeFormulaRoll(content, label, true);
		} else if (newChatMessage.value.startsWith('/pr')) {
			const { content, label } = handleChatRoll(contentInitial, labelInitial);

			// execute un lancer pour tout le monde
			await executeFormulaRoll(content, label, false);
		}
	} else {
		await sendChatMessage(newChatMessage.value, isChatWhisper.value);
	}

	newChatMessage.value = '';
	await scrollToBottom();
}

function getStatTooltip(key: StatName): string {
	const tooltips: Record<StatName, string> = {
		force: 'Force (FOR) :\n• Force brute\n• Endurance\n• Constitution',
		dexterite: 'Dextérité (DEX) :\n• Précision\n• Réflexes\n• Discrétion',
		intellect: 'Intellect (INT) :\n• Magie\n• Analyse\n• Connaissances anciennes',
		sagesse: 'Sagesse (SAG) :\n• Perception\n• Volonté\n• Charisme',
	};
	return tooltips[key] || '';
}

// Propriété calculée pour rassembler tous les favoris du personnage
const hasAnyFavorites = computed(() => {
	if (!sheet.value) return false;
	const wFav = sheet.value.weapons?.some((w) => w.favorite) || false;
	const sFav = sheet.value.spells?.some((s) => s.favorite) || false;
	const aFav = sheet.value.armors?.some((a) => a.favorite) || false;
	const fFav = sheet.value.feats?.some((f) => f.favorite) || false;
	const iFav = sheet.value.inventory?.some((i) => i.favorite) || false;
	return wFav || sFav || aFav || fFav || iFav;
});

// Fonction pour utiliser un consommable
function consumeItem(item: any) {
	handleUseConsumable(item, isRollSecret.value);
}

// Fonction appelée par le bouton "Lancer" de la formule libre
async function handleFormulaSubmit() {
	await executeFormulaRoll(customFormulaInput.value, customLabel.value, isRollSecret.value);
	customFormulaInput.value = ''; // Vide l'input après le lancer
}

const scrollToBottom = async () => {
	// nextTick permet d'attendre que Vue ait bien fini d'insérer le nouveau message dans le DOM
	await nextTick();
	setTimeout(() => {
		if (chatScrollContainer.value) {
			chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight;
		}
	}, 50); // On ajoute un petit délai pour s'assurer que le DOM est bien mis à jour
};

// Récupère l'ensemble de tous les favoris triés par leur ordre actuel
const allCurrentFavorites = computed({
	get() {
		if (!sheet.value) return [];

		const list: { item: any; type: string }[] = [];

		sheet.value.weapons?.forEach((w) => {
			if (w.favorite) list.push({ item: w, type: 'weapon' });
		});
		sheet.value.spells?.forEach((s) => {
			if (s.favorite) list.push({ item: s, type: 'spell' });
		});
		sheet.value.armors?.forEach((a) => {
			if (a.favorite) list.push({ item: a, type: 'armor' });
		});
		sheet.value.feats?.forEach((f) => {
			if (f.favorite) list.push({ item: f, type: 'feat' });
		});
		sheet.value.inventory?.forEach((i) => {
			if (i.favorite) list.push({ item: i, type: 'inventory' });
		});

		// Tri par l'ordre personnalisé (favoriteOrder), ou par défaut sur 0
		return list.sort((a, b) => (a.item.favoriteOrder ?? list.length) - (b.item.favoriteOrder ?? list.length));
	},
	set(newVal) {
		// newVal est la nouvelle liste réordonnée par le drag-and-drop
		// On met à jour le "favoriteOrder" de chaque élément en fonction de sa nouvelle position
		newVal.forEach((fav, index) => {
			fav.item.favoriteOrder = index;
		});
		// On sauvegarde la feuille pour enregistrer le tout
		saveSheet();
	},
});

function onDragEnd() {
	// Met à jour l'ordre de chaque favori selon sa nouvelle position dans la liste globale
	allCurrentFavorites.value.forEach((fav, index) => {
		fav.item.favoriteOrder = index;
	});
	saveSheet();
}

const showInitModal = ref(false);
const pendingTokenId = ref<string | null>(null);

async function openInitModal() {
	const selection = await OBR.player.getSelection();
	if (selection && selection.length > 0) {
		pendingTokenId.value = selection[0];
		showInitModal.value = true;
	} else {
		alert("Veuillez d'abord sélectionner un pion sur la carte d'Owlbear Rodeo.");
	}
}

async function confirmInit(type: 'pj' | 'monster') {
	if (pendingTokenId.value) {
		await initializeTokenSheet(pendingTokenId.value, type);
		showInitModal.value = false;
		pendingTokenId.value = null;
	}
}

const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileInput() {
	fileInputRef.value?.click();
}

onMounted(() => {
	init(scrollToBottom);
});
</script>

<template>
	<div
		class="app-container"
		:class="{ 'is-split': isChatDetached, 'chat-left': chatPosition === 'left' }"
	>
		<!-- ZONE PRINCIPALE (Contient la navigation et les onglets habituels) -->
		<main class="main-content">
			<!-- NAVIGATION PRINCIPALE -->
			<div class="tabs-navigation">
				<button
					class="tab-btn"
					:class="{ active: activeTab === 'roller' }"
					@click="activeTab = 'roller'"
				>
					<Dices :size="16" />
				</button>

				<button
					class="tab-btn"
					:class="{ active: activeTab === 'sheet' }"
					@click="activeTab = 'sheet'"
				>
					<ScrollText :size="16" /> Fiches
				</button>

				<!-- Onglet Chat classique (masqué si le chat est déjà détaché en colonne) -->
				<button
					v-if="!isChatDetached"
					@click="
						activeTab = 'chat';
						scrollToBottom();
					"
					:class="{ active: activeTab === 'chat' }"
					class="tab-btn"
				>
					<MessageCircle :size="16" /> Chat
					<span
						v-if="chatMessages.length > 0"
						class="tab-badge"
						>{{ chatMessages.length }}</span
					>
				</button>

				<button
					v-if="isGM"
					@click="activeTab = 'gm-dashboard'"
					:class="{ active: activeTab === 'gm-dashboard' }"
					class="tab-btn"
				>
					<Crown :size="16" /> MJ
				</button>

				<button
					class="tab-btn"
					:class="{ active: activeTab === 'help' }"
					@click="activeTab = 'help'"
				>
					<BookOpenText :size="16" /> Aides
				</button>
			</div>

			<div
				v-if="!isReady"
				class="status-msg"
			>
				Connexion à Owlbear Rodeo...
			</div>

			<!-- ONGLET 1 : FICHE DE PERSONNAGE -->
			<div v-else-if="activeTab === 'sheet'">
				<div class="character-selector-bar">
					<label class="selector-label"><Scroll :size="14" /> Fiche active :</label>
					<select
						v-model="currentSheetTokenId"
						@change="changeActiveToken(currentSheetTokenId)"
						class="character-select"
					>
						<option
							value=""
							disabled
						>
							-- Choisir un personnage --
						</option>
						<option
							v-for="char in availableTokens"
							:key="char.id"
							:value="char.id"
						>
							{{ char.name || 'Sans nom' }} {{ isGM && char.ownerIds.length === 0 ? '(PNJ/Monstre)' : '' }}
						</option>
					</select>
					<!-- Bouton pour initialiser le token actuellement sélectionné sur la map -->
					<button
						v-if="isGM"
						@click="openInitModal"
						class="btn-add"
						title="Initialiser une nouvelle fiche pour le pion sélectionné"
					>
						<Plus :size="14" /> Initialiser Fiche
					</button>

					<div
						v-if="showInitModal"
						class="modal-overlay"
						@click.self="showInitModal = false"
					>
						<div class="modal-card">
							<h3>Initialiser le personnage</h3>
							<p>Quel type de fiche souhaitez-vous créer pour ce pion ?</p>

							<div class="modal-actions">
								<button
									@click="confirmInit('pj')"
									class="btn-modal btn-pj"
								>
									Personnage Joueur (Persistant par nom)
								</button>
								<button
									@click="confirmInit('monster')"
									class="btn-modal btn-monster"
								>
									Monstre / PNJ (Indépendant par pion)
								</button>
							</div>

							<button
								@click="showInitModal = false"
								class="btn-cancel"
							>
								Annuler
							</button>
						</div>
					</div>
				</div>

				<!-- SI AUCUN TOKEN SÉLECTIONNÉ -->
				<div
					v-if="!currentSheetTokenId"
					class="status-msg"
				>
					Veuillez sélectionner un personnage dans le menu ci-dessus.
				</div>

				<div
					v-else-if="isLoadingSheet"
					class="status-msg"
				>
					Chargement de la fiche en cours...
				</div>

				<!-- ACCÈS RESTREINT -->
				<div
					v-else-if="!canEdit"
					class="sheet-card restricted-card"
				>
					<div class="restricted-content">
						<Lock
							:size="32"
							class="restricted-icon-svg"
						/>
						<h3>Accès restreint</h3>
						<p>Vous n'avez pas les droits nécessaires pour consulter ou modifier la fiche de ce pion.</p>
					</div>
				</div>

				<!-- FICHE NORMALE -->
				<div
					v-else
					class="sheet-card"
					:class="{
						'sheet-dead': sheet.wounds.filter((w) => w).length === 6,
						'sheet-corrupted': sheet.corruption >= 20,
					}"
				>
					<!-- BARRE DE MASQUAGE GLOBALE FICHE -->
					<div class="sheet-io-actions">
						<div class="secret-toggle-bar">
							<label class="checkbox-secret-label">
								<input
									type="checkbox"
									v-model="isRollSecret"
								/>
								Masquer mes lancers (MJ uniquement)
							</label>
						</div>
						<button
							@click="exportCharacterSheet"
							class="btn-io"
							title="Exporter la fiche en JSON"
						>
							Exporter
						</button>

						<!-- Input file masqué pour l'import -->
						<input
							type="file"
							ref="fileInputRef"
							@change="importCharacterSheet"
							accept=".json"
							style="display: none"
						/>

						<button
							@click="triggerFileInput"
							class="btn-io"
							title="Importer une fiche depuis un JSON"
						>
							Importer
						</button>
					</div>

					<div class="species-selector-box">
						<label class="species-label"><Leaf :size="14" /> Espèce :</label>
						<select
							v-model="sheet.species"
							@change="saveSheet"
							class="species-select"
						>
							<option
								v-for="(data, key) in SPECIES_DATA"
								:key="key"
								:value="key"
							>
								{{ data.name }}
							</option>
						</select>
					</div>

					<!-- TALENT & ANCIEN MÉTIER -->
					<div class="info-row-grid">
						<div class="talent-box">
							<div class="talent-title"><Sparkles :size="14" /> Talent : {{ currentSpeciesData.talentName }}</div>
							<div class="talent-desc">{{ currentSpeciesData.talentDescription }}</div>
						</div>

						<div class="profession-box">
							<div class="profession-header">
								<span class="profession-label"><Wrench :size="14" /> Ancien Métier :</span>
								<input
									v-model="sheet.professionName"
									@change="saveSheet"
									class="profession-name-input"
									placeholder="Ex: Forgeron..."
								/>
							</div>
							<input
								v-model="sheet.professionDescription"
								@change="saveSheet"
								class="profession-desc-input"
								placeholder="Avantage : Ex: ...sur l'artisanat"
							/>
						</div>
					</div>

					<!-- PV/PE & BLESSURES/CORRUPTION -->
					<div class="top-status-grid">
						<div class="resources-row">
							<div class="resource-box hp-box">
								<div class="resource-header">
									<span
										><Heart
											:size="14"
											class="icon-hp"
										/>
										PV</span
									>
									<div class="inputs-inline">
										<input
											type="number"
											v-model.number="sheet.hpCurrent"
											@change="saveSheet"
											class="num-input"
										/>
										<span>/</span>
										<input
											type="number"
											v-model.number="sheet.hpMax"
											@change="saveSheet"
											class="num-input"
										/>
									</div>
									<div class="btn-est">(Est: {{ estimatedHpMax }})</div>
								</div>
								<div class="bar-controls">
									<div class="bar-background">
										<div
											class="bar-fill hp-fill"
											:style="{ width: Math.min(100, Math.max(0, (sheet.hpCurrent / (sheet.hpMax || 1)) * 100)) + '%' }"
										></div>
									</div>
									<div class="resource-controls">
										<button @click="updateHp(-5)">-5</button><button @click="updateHp(-1)">-1</button
										><button @click="updateHp(1)">+1</button><button @click="updateHp(5)">+5</button>
									</div>
								</div>
							</div>

							<div class="resource-box pe-box">
								<div class="resource-header">
									<span
										><Zap
											:size="14"
											class="icon-pe"
										/>
										PE</span
									>
									<div class="inputs-inline">
										<input
											type="number"
											v-model.number="sheet.peCurrent"
											@change="saveSheet"
											class="num-input"
										/>
										<span>/</span>
										<input
											type="number"
											v-model.number="sheet.peMax"
											@change="saveSheet"
											class="num-input"
										/>
									</div>
									<div class="btn-est">(Est: {{ estimatedPeMax }})</div>
								</div>
								<div class="bar-controls">
									<div class="bar-background">
										<div
											class="bar-fill pe-fill"
											:style="{ width: Math.min(100, Math.max(0, (sheet.peCurrent / (sheet.peMax || 1)) * 100)) + '%' }"
										></div>
									</div>
									<div class="resource-controls">
										<button @click="updatePe(-5)">-5</button><button @click="updatePe(-1)">-1</button
										><button @click="updatePe(1)">+1</button><button @click="updatePe(5)">+5</button>
									</div>
								</div>
							</div>
						</div>

						<div class="status-side-row">
							<div class="wounds-section">
								<div class="wounds-header">
									<span class="wounds-label"
										><Bone
											:size="14"
											class="icon-wound"
										/>
										Blessures :</span
									>
									<span
										v-if="sheet.hpCurrent <= 0 && sheet.wounds.filter((w) => w).length < 6"
										class="corr-badge status-perdu"
										>Mourant</span
									>
									<span
										v-if="sheet.wounds.filter((w) => w).length === 6"
										class="corr-badge status-perdu"
										><Skull :size="14"
									/></span>
								</div>
								<div class="wounds-grid">
									<button
										v-for="(isWounded, index) in sheet.wounds"
										:key="index"
										class="wound-box"
										@click="toggleWound(index)"
									>
										<span
											class="wound-indicator"
											:class="{ 'is-wounded': isWounded }"
										></span>
									</button>
								</div>
								<button
									v-if="sheet.hpCurrent <= 0"
									@click="rollStatCheck('force', 'Constitution', isRollSecret)"
									class="btn-weapon-roll btn-damage"
									style="margin-top: 16px"
								>
									Constitution
								</button>
							</div>

							<div class="corruption-section">
								<div class="corruption-header">
									<span class="corr-title"><Skull :size="14" /> Corruption :</span>
									<input
										type="number"
										v-model.number="sheet.corruption"
										@change="saveSheet"
										class="num-input corr-input"
									/>
									<span
										class="corr-badge"
										:class="corruptionStatus.class"
										>{{ corruptionStatus.level }}</span
									>
								</div>
								<div class="corr-effect"><strong>Effet :</strong> {{ corruptionStatus.effect }}</div>
							</div>
						</div>
					</div>

					<!-- Statistiques -->
					<div class="stats-section">
						<!-- EN-TÊTE DE L'ACCORDÉON STATISTIQUES (Cliquable) -->
						<div
							class="accordion-header"
							@click="isOpenStats = !isOpenStats"
						>
							<div class="accordion-title">
								<Activity :size="14" />
								<span>Statistiques</span>

								<div class="dodge-title">
									<PersonStanding :size="14" />
									<span class="dodge-val">{{ dodgePenalty === 0 ? '0' : Math.abs(dodgePenalty) }}</span>
								</div>

								<div class="protection-title">
									<Shield :size="14" />
									<span class="protection-val">{{
										protectionPenalty.protection === 0 ? '0' : protectionPenalty.protection
									}}</span>
								</div>
								<div class="protection-title">
									<ShieldX :size="14" />
									<span
										class="protection-val"
										:class="{ 'has-penalty': protectionPenalty.dexterity < 0 }"
										>{{ protectionPenalty.dexterity === 0 ? '0' : protectionPenalty.dexterity }}</span
									>
								</div>
							</div>

							<button
								class="btn-toggle-desc"
								type="button"
								tabIndex="-1"
							>
								<component
									:is="isOpenStats ? ChevronUp : ChevronDown"
									:size="16"
								/>
							</button>
						</div>

						<!-- CONTENU DE L'ACCORDÉON -->
						<div
							v-if="isOpenStats"
							class="stats-grid"
						>
							<div
								v-for="(label, key) in statLabels"
								:key="key"
								class="stat-box"
							>
								<!-- En-tête mis en avant avec le nom de la stat et le bouton de lancer -->
								<div class="stat-main-header">
									<span
										class="stat-name-title with-tooltip"
										:title="getStatTooltip(key)"
									>
										<HelpCircle
											:size="14"
											class="inline-icon"
										/>
										{{ label }}
									</span>
									<button
										@click="rollStatCheck(key, label, isRollSecret)"
										class="btn-roll-dice"
										:title="`Lancer test de ${label}`"
									>
										<Dices :size="16" />
									</button>
								</div>

								<!-- Contrôles de valeur -->
								<div class="stat-controls">
									<button
										@click="
											sheet.stats[key]--;
											saveSheet();
										"
										class="btn-step"
									>
										-
									</button>
									<input
										type="number"
										v-model.number="sheet.stats[key]"
										@change="saveSheet"
										class="stat-input"
									/>
									<button
										@click="
											sheet.stats[key]++;
											saveSheet();
										"
										class="btn-step"
									>
										+
									</button>
								</div>

								<!-- Indice de bonus racial -->
								<div
									v-if="currentSpeciesData.statBonus[key]"
									class="racial-bonus-hint"
								>
									+{{ currentSpeciesData.statBonus[key] }} (Racial)
								</div>
							</div>
						</div>
						<div
							v-if="isOpenStats"
							class="dodge-banner"
						>
							<div class="dodge-title"><PersonStanding :size="14" /> Indice d'Esquive</div>
							<div class="dodge-text">
								Malus attaquant :
								<span
									class="dodge-val"
									:class="{ 'has-penalty': dodgePenalty < 0 }"
									>{{ dodgePenalty === 0 ? '0' : dodgePenalty }}</span
								>
							</div>
						</div>

						<div
							v-if="isOpenStats"
							class="protection-banner"
						>
							<div class="protection-title"><Shield :size="14" /> Indice de Protection</div>
							<div class="protection-text">
								Bonus protection :
								<span class="protection-val">{{
									protectionPenalty.protection === 0 ? '0' : protectionPenalty.protection
								}}</span>
							</div>

							<div class="protection-title"><ShieldX :size="14" /> Indice de Malus</div>
							<div class="protection-text">
								Malus dexterité :
								<span
									class="protection-val"
									:class="{ 'has-penalty': protectionPenalty.dexterity < 0 }"
									>{{ protectionPenalty.dexterity === 0 ? '0' : protectionPenalty.dexterity }}</span
								>
							</div>
						</div>
					</div>

					<div class="equipped-section">
						<!-- EN-TÊTE DE L'ACCORDÉON (Cliquable) -->
						<div
							class="accordion-header"
							@click="isOpenEquipped = !isOpenEquipped"
						>
							<div class="accordion-title">
								<Sword :size="14" />
								<span
									>Équipement actif ({{
										sheet.weapons.filter((w) => w.equipped).length + sheet.armors.filter((a) => a.equipped).length
									}})</span
								>
							</div>
							<button class="btn-toggle-desc">
								<component
									:is="isOpenEquipped ? ChevronUp : ChevronDown"
									:size="16"
								/>
							</button>
						</div>

						<!-- CONTENU DE L'ACCORDÉON (Affiché conditionnellement) -->
						<div
							v-if="isOpenEquipped"
							class="equipped-weapons"
						>
							<!-- Armes equipées -->
							<div
								v-for="weapon in sheet.weapons.filter((w) => w.equipped)"
								:key="'fav-w-' + weapon.id"
							>
								<div class="fav-quick-header">
									<span class="fav-quick-type"><Sword :size="12" /> Arme</span>
									<span class="fav-quick-name">{{ weapon.name || 'Arme sans nom' }}</span>
									<div class="fav-quick-actions">
										<div class="fav-quick-actions-container">
											<button
												@click="rollWeaponAttack(weapon, isRollSecret)"
												class="btn-weapon-roll btn-attack"
											>
												Attaquer
											</button>
											<button
												@click="rollWeaponDamage(weapon, isRollSecret)"
												class="btn-weapon-roll btn-damage"
												title="Lancer les dégâts"
											>
												<Sword :size="10" />
											</button>
										</div>
									</div>
									<button
										v-if="weapon.description"
										@click="toggleFavoriteDesc('w-' + weapon.id)"
										class="btn-toggle-desc"
										title="Voir la description"
									>
										<component
											:is="expandedFavorites['w-' + weapon.id] ? ChevronUp : ChevronDown"
											:size="14"
										/>
									</button>
									<button
										@click="
											weapon.equipped = false;
											saveSheet();
										"
										class="btn-remove-fav"
										title="Déséquiper l'arme"
									>
										<X :size="14" />
									</button>
								</div>
								<div
									v-if="expandedFavorites['w-' + weapon.id] && weapon.description"
									class="equipped-quick-expanded-desc"
								>
									{{ weapon.description }}
								</div>
							</div>

							<!-- Armures equipées -->
							<div
								v-for="armor in sheet.armors.filter((a) => a.equipped)"
								:key="'fav-a-' + armor.id"
							>
								<div class="fav-quick-header">
									<span class="fav-quick-type"><Shield :size="12" /> Armure</span>
									<span class="fav-quick-name">{{ armor.name || 'Armure' }} (Prot: {{ armor.protection || 0 }})</span>
									<button
										v-if="armor.description"
										@click="toggleFavoriteDesc('a-' + armor.id)"
										class="btn-toggle-desc"
										title="Voir la description"
									>
										<component
											:is="expandedFavorites['a-' + armor.id] ? ChevronUp : ChevronDown"
											:size="14"
										/>
									</button>
									<button
										@click="
											armor.equipped = false;
											saveSheet();
										"
										class="btn-remove-fav"
										title="Déséquiper l'armure"
									>
										<X :size="14" />
									</button>
								</div>
								<div
									v-if="expandedFavorites['a-' + armor.id] && armor.description"
									class="equipped-quick-expanded-desc"
								>
									{{ armor.description }}
								</div>
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLETS INTERNES -->
					<!-- SOUS-ONGLETS INTERNES RÉORDONNABLES -->
					<draggable
						v-model="orderedSubTabs"
						item-key="id"
						class="subtabs-navigation"
						direction="horizontal"
					>
						<template #item="{ element: tab }">
							<button
								class="subtab-btn"
								:class="{
									active: activeSubTab === tab.id,
									'fav-tab-btn': tab.isFav,
								}"
								@click="activeSubTab = tab.id"
							>
								<Star
									v-if="tab.isFav"
									:size="12"
									fill="#f59e0b"
									class="fav-icon-tab"
								/>
								<GripVertical
									v-else
									:size="12"
									class="fav-icon-tab"
								/>
								{{ tab.label }}{{ getSubTabCount(tab.id) }}
							</button>
						</template>
					</draggable>

					<!-- SOUS-ONGLET 0 : FAVORIS -->
					<div
						v-if="activeSubTab === 'favorites'"
						class="subtab-content"
					>
						<h4 class="sub-section-title">Accès Rapide (Favoris)</h4>
						<div
							v-if="!hasAnyFavorites"
							class="empty-hint"
						>
							Aucun favori sélectionné. Cliquez sur l'étoile (<Star
								:size="9"
								fill="#f59e0b"
							/>) d'un élément pour l'ajouter ici.
						</div>

						<div
							v-else
							class="favorites-quick-container"
						>
							<draggable
								v-model="allCurrentFavorites"
								item-key="(fav) => fav.type + '-' + fav.item.id"
								class="favorites-quick-container"
								handle=".drag-handle"
								@end="onDragEnd"
							>
								<template #item="{ element: fav }">
									<div class="fav-quick-card">
										<!-- EN-TÊTE COMMUN AVEC BOUTONS DE TRI GLOBAL -->
										<div class="fav-quick-header">
											<div
												class="drag-handle"
												title="Glisser pour réordonner"
											>
												<GripVertical :size="14" />
											</div>
											<!-- 1. ARME -->
											<template v-if="fav.type === 'weapon'">
												<span class="fav-quick-type"><Sword :size="12" /> Arme</span>
												<span class="fav-quick-name">{{ fav.item.name || 'Arme sans nom' }}</span>
												<button
													v-if="!fav.item.equipped"
													@click="
														fav.item.equipped = true;
														saveSheet();
													"
													class="btn-add"
												>
													<Plus :size="12" /> Equiper
												</button>
												<button
													v-else
													@click="
														fav.item.equipped = false;
														saveSheet();
													"
													class="btn-add"
												>
													<Minus :size="12" /> Déséquiper
												</button>
											</template>

											<!-- 2. SORT -->
											<template v-else-if="fav.type === 'spell'">
												<span class="fav-quick-type"><Wand2 :size="12" /> Sort</span>
												<span class="fav-quick-name">{{ fav.item.name || 'Sort sans nom' }}</span>
												<span class="fav-quick-info"
													>Portée: {{ fav.item.range || 'Corps à corps' }} | {{ fav.item.peCost || 0 }} PE</span
												>
											</template>

											<!-- 3. ARMURE -->
											<template v-else-if="fav.type === 'armor'">
												<span class="fav-quick-type"><Shield :size="12" /> Armure</span>
												<span class="fav-quick-name"
													>{{ fav.item.name || 'Armure' }} (Prot: {{ fav.item.protection || 0 }})</span
												>
												<button
													v-if="!fav.item.equipped"
													@click="
														fav.item.equipped = true;
														saveSheet();
													"
													class="btn-add"
												>
													<Plus :size="12" /> Equiper
												</button>
												<button
													v-else
													@click="
														fav.item.equipped = false;
														saveSheet();
													"
													class="btn-add"
												>
													<Minus :size="12" /> Déséquiper
												</button>
											</template>

											<!-- 4. DON -->
											<template v-else-if="fav.type === 'feat'">
												<span class="fav-quick-type"><Award :size="12" /> Don</span>
												<span class="fav-quick-name">{{ fav.item.name || 'Don' }}</span>
											</template>

											<!-- 5. OBJET INVENTAIRE -->
											<template v-else-if="fav.type === 'inventory'">
												<span class="fav-quick-type"
													><Backpack :size="12" /> Objet (x{{ fav.item.quantity ?? 1 }})</span
												>
												<span class="fav-quick-name">{{ fav.item.name || 'Objet' }}</span>
												<button
													v-if="fav.item.formula && (fav.item.quantity ?? 1) > 0"
													@click="consumeItem(fav.item)"
													class="btn-use-item"
													title="Utiliser consommable"
												>
													<Play :size="10" /> Utiliser
												</button>
												<span
													v-else-if="fav.item.formula"
													class="btn-use-item disabled"
													>Épuisé</span
												>
											</template>

											<!-- BOUTONS COMMUNS (Description & Retirer des favoris) -->
											<button
												v-if="fav.item.description || (fav.type === 'feat' && fav.item.effect)"
												@click="toggleFavoriteDesc(fav.type[0] + '-' + fav.item.id)"
												class="btn-toggle-desc"
												title="Voir la description"
											>
												<component
													:is="expandedFavorites[fav.type[0] + '-' + fav.item.id] ? ChevronUp : ChevronDown"
													:size="14"
												/>
											</button>
											<button
												@click="
													fav.item.favorite = false;
													saveSheet();
												"
												class="btn-remove-fav"
												title="Retirer des favoris"
											>
												<X :size="14" />
											</button>
										</div>

										<!-- ACTIONS SPÉCIFIQUES (ex: Boutons Attaquer/Dégâts pour les armes, Incanter pour les sorts) -->
										<div
											v-if="fav.type === 'weapon'"
											class="fav-quick-actions"
										>
											<div class="fav-quick-actions-container">
												<button
													@click="rollWeaponAttack(fav.item, isRollSecret)"
													class="btn-weapon-roll btn-attack"
												>
													Attaquer
												</button>
												<button
													@click="rollWeaponDamage(fav.item, isRollSecret)"
													class="btn-weapon-roll btn-damage"
													title="Lancer les dégâts"
												>
													<Sword :size="10" />
												</button>
											</div>
											<div class="fav-quick-info">Dégâts : {{ fav.item.damage }}</div>
										</div>

										<div
											v-else-if="fav.type === 'spell'"
											class="fav-quick-actions"
										>
											<div class="fav-quick-actions-container">
												<button
													@click="rollSpellCast(fav.item, isRollSecret)"
													class="btn-weapon-roll btn-spell-cast"
												>
													Incanter
												</button>
												<button
													@click="rollSpellEffect(fav.item, isRollSecret)"
													class="btn-weapon-roll btn-spell-effect"
													title="Lancer les dégâts"
												>
													<Wand2 :size="10" />
												</button>
											</div>
											<div class="fav-quick-info">Dégâts : {{ fav.item.formula }}</div>
										</div>

										<div
											v-if="fav.type === 'inventory' && fav.item.formula"
											class="fav-quick-desc"
										>
											<span class="formula-tag">Formule : {{ fav.item.formula }}</span>
										</div>

										<!-- DESCRIPTION DÉPLIÉE -->
										<div
											v-if="
												expandedFavorites[fav.type[0] + '-' + fav.item.id] && (fav.item.description || fav.item.effect)
											"
											class="fav-quick-expanded-desc"
										>
											{{ fav.item.description || fav.item.effect }}
										</div>
									</div>
								</template>
							</draggable>
						</div>
					</div>

					<!-- SOUS-ONGLET 1 : ARSENAL -->
					<div
						v-else-if="activeSubTab === 'weapons'"
						class="subtab-content"
					>
						<div class="dynamic-section-header">
							<h4 class="sub-section-title">Arsenal (Armes)</h4>
							<button
								@click="addWeapon"
								class="btn-add"
							>
								<Plus :size="12" /> Arme
							</button>
						</div>
						<div class="weapons-list">
							<div
								v-for="weapon in sheet.weapons"
								:key="weapon.id"
								class="dynamic-card weapon-card"
							>
								<div class="card-top">
									<button
										@click="
											weapon.favorite = !weapon.favorite;
											saveSheet();
										"
										class="btn-fav"
										:class="{ active: weapon.favorite }"
										title="Ajouter aux favoris"
									>
										<Star
											:size="14"
											:fill="weapon.favorite ? '#f59e0b' : 'none'"
										/>
									</button>
									<input
										v-model="weapon.name"
										@change="saveSheet"
										class="card-title-input"
										placeholder="Nom de l'arme"
									/>
									<button
										@click="removeWeapon(weapon.id)"
										class="btn-del"
									>
										<Trash :size="12" />
									</button>
								</div>
								<div class="card-row-inputs">
									<label
										>Dégâts:
										<input
											type="text"
											v-model="weapon.damage"
											@change="saveSheet"
											class="small-text-input"
											placeholder="1d6"
									/></label>
									<label
										>Qualité:
										<input
											type="text"
											v-model="weapon.quality"
											@change="saveSheet"
											class="small-text-input"
									/></label>
								</div>
								<div class="card-row-inputs">
									<label
										>Type:
										<select
											v-model="weapon.weaponType"
											@change="saveSheet"
											class="small-select"
										>
											<option
												v-for="w in weaponList"
												:key="w"
												:value="w"
											>
												{{ w }}
											</option>
										</select>
									</label>
									<label
										>Stat:
										<select
											v-model="weapon.stat"
											@change="saveSheet"
											class="small-select"
										>
											<option value="force">Force</option>
											<option value="dexterite">Dextérité</option>
											<option value="intellect">Intellect</option>
											<option value="sagesse">Sagesse</option>
										</select>
									</label>
									<button
										v-if="!weapon.equipped"
										@click="
											weapon.equipped = !weapon.equipped;
											saveSheet();
										"
										class="btn-add"
									>
										<Plus :size="12" /> Equiper
									</button>
									<button
										v-else
										@click="
											weapon.equipped = !weapon.equipped;
											saveSheet();
										"
										class="btn-add"
									>
										<Minus :size="12" /> Déséquiper
									</button>
								</div>
								<textarea
									v-model="weapon.description"
									@change="saveSheet"
									class="card-textarea"
									placeholder="Description (ex: effet secondaire...)"
									rows="2"
								></textarea>
								<div class="weapon-roll-actions">
									<button
										@click="rollWeaponAttack(weapon, isRollSecret)"
										class="btn-weapon-roll btn-attack"
									>
										Attaquer ({{
											sheet.stats[weapon.stat] + getRankFromXp(sheet.weaponXp[weapon.weaponType] || 0).hitBonus
										}})
									</button>
									<button
										@click="rollWeaponDamage(weapon, isRollSecret)"
										class="btn-weapon-roll btn-damage"
										title="Lancer les dégâts"
									>
										<Sword :size="10" />
									</button>
								</div>
							</div>
							<div
								v-if="sheet.weapons.length === 0"
								class="empty-hint"
							>
								Aucune arme équipée.
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLET 2 : SORTS -->
					<div
						v-else-if="activeSubTab === 'spells'"
						class="subtab-content"
					>
						<div class="dynamic-section-header">
							<h4 class="sub-section-title">Sorts & Capacités</h4>
							<button
								@click="addSpell"
								class="btn-add"
							>
								<Plus :size="12" /> Sort
							</button>
						</div>
						<div class="spells-list">
							<div
								v-for="spell in sheet.spells"
								:key="spell.id"
								class="dynamic-card spell-card"
							>
								<div class="card-top">
									<button
										@click="
											spell.favorite = !spell.favorite;
											saveSheet();
										"
										class="btn-fav"
										:class="{ active: spell.favorite }"
										title="Ajouter aux favoris"
									>
										<Star
											:size="14"
											:fill="spell.favorite ? '#f59e0b' : 'none'"
										/>
									</button>
									<input
										v-model="spell.name"
										@change="saveSheet"
										class="card-title-input"
										placeholder="Nom du sort"
									/>
									<button
										@click="removeSpell(spell.id)"
										class="btn-del"
									>
										<Trash :size="12" />
									</button>
								</div>
								<div class="card-row-inputs">
									<label
										>Niv:
										<input
											type="number"
											v-model.number="spell.level"
											@change="saveSheet"
											class="small-num-input"
									/></label>
									<label
										>Portée:
										<input
											type="text"
											v-model="spell.range"
											@change="saveSheet"
											class="small-text-input"
									/></label>
									<label
										>PE:
										<input
											type="number"
											v-model.number="spell.peCost"
											@change="saveSheet"
											class="small-num-input"
									/></label>
								</div>
								<div class="card-row-inputs">
									<label
										>Stat:
										<select
											v-model="spell.stat"
											@change="saveSheet"
											class="small-select"
										>
											<option value="intellect">Intellect</option>
											<option value="sagesse">Sagesse</option>
											<option value="force">Force</option>
											<option value="dexterite">Dextérité</option>
										</select>
									</label>
									<label
										>Type:
										<select
											v-model="spell.weaponType"
											@change="saveSheet"
											class="small-select"
										>
											<option
												v-for="w in weaponList"
												:key="w"
												:value="w"
											>
												{{ w }}
											</option>
										</select>
									</label>
									<label
										>Effet:
										<input
											type="text"
											v-model="spell.formula"
											@change="saveSheet"
											class="small-text-input"
											placeholder="2d6+3"
									/></label>
								</div>
								<textarea
									v-model="spell.description"
									@change="saveSheet"
									class="card-textarea"
									placeholder="Description (ex: effet secondaire...)"
									rows="2"
								></textarea>

								<!-- Boutons d'action mis à jour avec affichage du bonus de stat et de la formule -->
								<div class="weapon-roll-actions">
									<button
										@click="rollSpellCast(spell, isRollSecret)"
										class="btn-weapon-roll btn-spell-cast"
									>
										Incanter ({{ sheet.stats[spell.stat || 'intellect'] || 0 }})
									</button>
									<button
										@click="rollSpellEffect(spell, isRollSecret)"
										class="btn-weapon-roll btn-spell-effect"
										title="Lancer les dégâts"
									>
										<Wand2 :size="14" />
									</button>
								</div>
							</div>
							<div
								v-if="sheet.spells.length === 0"
								class="empty-hint"
							>
								Aucun sort.
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLET 3 : ARMURES -->
					<div
						v-else-if="activeSubTab === 'armors'"
						class="subtab-content"
					>
						<div class="dynamic-section-header">
							<h4 class="sub-section-title">Équipement (Armures)</h4>
							<button
								@click="addArmor"
								class="btn-add"
							>
								<Plus :size="12" /> Armure
							</button>
						</div>
						<div class="armors-list">
							<div
								v-for="armor in sheet.armors"
								:key="armor.id"
								class="dynamic-card"
							>
								<div class="card-top">
									<button
										@click="
											armor.favorite = !armor.favorite;
											saveSheet();
										"
										class="btn-fav"
										:class="{ active: armor.favorite }"
										title="Ajouter aux favoris"
									>
										<Star
											:size="14"
											:fill="armor.favorite ? '#f59e0b' : 'none'"
										/>
									</button>
									<input
										v-model="armor.name"
										@change="saveSheet"
										class="card-title-input"
										placeholder="Nom armure"
									/>
									<button
										@click="removeArmor(armor.id)"
										class="btn-del"
									>
										<Trash :size="12" />
									</button>
								</div>
								<div class="card-row-inputs">
									<label
										>Prot:
										<input
											type="number"
											v-model.number="armor.protection"
											@change="saveSheet"
											class="small-num-input"
									/></label>
									<label
										>Malus DEX:
										<input
											type="number"
											v-model.number="armor.dexMalus"
											@change="saveSheet"
											class="small-num-input"
									/></label>
									<button
										v-if="!armor.equipped"
										@click="
											armor.equipped = !armor.equipped;
											saveSheet();
										"
										class="btn-add"
									>
										<Plus :size="12" /> Equiper
									</button>
									<button
										v-else
										@click="
											armor.equipped = !armor.equipped;
											saveSheet();
										"
										class="btn-add"
									>
										<Minus :size="12" /> Déséquiper
									</button>
								</div>
								<textarea
									v-model="armor.description"
									@change="saveSheet"
									class="card-textarea"
									placeholder="Description (ex: effet secondaire...)"
									rows="2"
								></textarea>
							</div>
							<div
								v-if="sheet.armors.length === 0"
								class="empty-hint"
							>
								Aucune armure.
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLET 4 : MAÎTRISES -->
					<div
						v-else-if="activeSubTab === 'masteries'"
						class="subtab-content"
					>
						<h4 class="sub-section-title">Maîtrises d'Armes (XP)</h4>
						<div
							class="masteries-list"
							style="margin-top: 8px"
						>
							<div
								v-for="weapon in weaponList"
								:key="weapon"
								class="mastery-row"
							>
								<span class="weapon-name">{{ weapon }}</span>
								<div class="xp-input-wrapper">
									<input
										type="number"
										v-model.number="sheet.weaponXp[weapon]"
										@change="saveSheet"
										placeholder="0"
										class="xp-input"
									/>
									<span class="xp-unit">XP</span>
								</div>
								<div class="rank-badge-box">
									<span class="rank-tag">Rang {{ getRankFromXp(sheet.weaponXp[weapon] || 0).rank }}</span>
									<span class="rank-details"
										>{{ getRankFromXp(sheet.weaponXp[weapon] || 0).dice }} (+{{
											getRankFromXp(sheet.weaponXp[weapon] || 0).hitBonus
										}})</span
									>
								</div>
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLET 5 : DONS -->
					<div
						v-else-if="activeSubTab === 'feats'"
						class="subtab-content"
					>
						<div class="dynamic-section-header">
							<h4 class="sub-section-title">Dons & Aptitudes</h4>
							<button
								@click="addFeat"
								class="btn-add"
							>
								<Plus :size="12" /> Don
							</button>
						</div>
						<div class="feats-list">
							<div
								v-for="feat in sheet.feats"
								:key="feat.id"
								class="dynamic-card"
							>
								<div class="card-top">
									<button
										@click="
											feat.favorite = !feat.favorite;
											saveSheet();
										"
										class="btn-fav"
										:class="{ active: feat.favorite }"
										title="Ajouter aux favoris"
									>
										<Star
											:size="14"
											:fill="feat.favorite ? '#f59e0b' : 'none'"
										/>
									</button>
									<input
										v-model="feat.name"
										@change="saveSheet"
										class="card-title-input"
										placeholder="Nom du don"
									/>
									<button
										@click="removeFeat(feat.id)"
										class="btn-del"
									>
										<Trash :size="12" />
									</button>
								</div>
								<textarea
									v-model="feat.effect"
									@change="saveSheet"
									class="card-textarea"
									placeholder="Effet..."
									rows="2"
								></textarea>
							</div>
							<div
								v-if="sheet.feats.length === 0"
								class="empty-hint"
							>
								Aucun don.
							</div>
						</div>
					</div>

					<!-- SOUS-ONGLET 6 : INVENTAIRE -->
					<div
						v-else-if="activeSubTab === 'inventory'"
						class="subtab-content"
					>
						<div class="money-section">
							<span class="money-title"><Coins :size="14" /> Monnaie :</span>
							<div class="money-input-wrapper">
								<input
									type="number"
									v-model.number="sheet.ec"
									@change="saveSheet"
									class="num-input money-input"
								/>
								<span class="money-unit">EC</span>
							</div>
						</div>

						<div class="dynamic-section-header">
							<h4 class="sub-section-title"><Backpack :size="14" /> Inventaire</h4>
							<button
								@click="addInventoryItem"
								class="btn-add"
							>
								<Plus :size="12" /> Objet
							</button>
						</div>
						<div class="inventory-list">
							<div
								v-for="item in sheet.inventory"
								:key="item.id"
								class="dynamic-card"
							>
								<div class="card-top">
									<button
										@click="
											item.favorite = !item.favorite;
											saveSheet();
										"
										class="btn-fav"
										:class="{ active: item.favorite }"
										title="Ajouter aux favoris"
									>
										<Star
											:size="14"
											:fill="item.favorite ? '#f59e0b' : 'none'"
										/>
									</button>
									<input
										v-model="item.name"
										@change="saveSheet"
										class="card-title-input"
										placeholder="Nom objet"
									/>
									<div class="qty-wrapper">
										<span class="qty-label">Qté:</span>
										<input
											type="number"
											v-model.number="item.quantity"
											@change="saveSheet"
											class="qty-input"
										/>
									</div>
									<button
										v-if="canEdit"
										@click="removeInventoryItem(item.id)"
										class="btn-del"
									>
										<Trash :size="12" />
									</button>
								</div>
								<div class="card-row-inputs">
									<label
										>Formule (Conso):
										<input
											type="text"
											v-model="item.formula"
											@change="saveSheet"
											class="small-text-input"
											placeholder="1d6+2"
											title="Formule de dé lancée lors de l'utilisation"
									/></label>
									<button
										v-if="item.formula && (item.quantity ?? 1) > 0"
										@click="consumeItem(item)"
										class="btn-use-item"
										title="Utiliser consommable"
									>
										<Play :size="10" /> Utiliser
									</button>
									<span
										v-else-if="item.formula"
										class="btn-use-item disabled"
										>Épuisé</span
									>
								</div>
								<textarea
									v-model="item.description"
									@change="saveSheet"
									class="card-textarea"
									placeholder="Description..."
									rows="2"
								></textarea>
							</div>
							<div
								v-if="sheet.inventory.length === 0"
								class="empty-hint"
							>
								Inventaire vide.
							</div>
						</div>
					</div>

					<!-- RESTRICTION MJ -->
					<div
						v-if="isGM"
						class="gm-section"
					>
						<h3><Key :size="14" /> Joueurs autorisé</h3>
						<div class="players-list">
							<div
								v-for="player in knownPlayers"
								:key="player.id"
								class="player-item"
							>
								<label>
									<input
										type="checkbox"
										:checked="sheet.ownerIds.includes(player.id)"
										@click="toggleOwner(player.id)"
									/>
									<span :style="{ color: player.color }">●</span> {{ player.name }}
								</label>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- ONGLET 2 : LANCEUR DE DÉS -->
			<div
				v-else-if="activeTab === 'roller'"
				class="sheet-card"
			>
				<div class="roller-container">
					<div class="roller-header">
						<h3><Dices :size="20" /> Lanceur de Dés Personnalisé</h3>
					</div>

					<!-- Section Nom & Nombre de dés -->
					<div class="roller-grid-2col">
						<div class="roller-group">
							<label class="roller-label">Libellé du jet :</label>
							<input
								type="text"
								v-model="customLabel"
								class="roller-text-input"
								placeholder="Ex: Jet de perception, Dégâts de feu..."
							/>
						</div>

						<div class="roller-group">
							<label class="roller-label">Nombre de dés :</label>
							<div class="dice-count-selector">
								<button
									@click="customDiceCount = Math.max(1, customDiceCount - 1)"
									class="btn-count"
								>
									-
								</button>
								<input
									type="number"
									v-model.number="customDiceCount"
									min="1"
									max="20"
									class="num-input count-input"
								/>
								<button
									@click="customDiceCount++"
									class="btn-count"
								>
									+
								</button>
							</div>
						</div>
					</div>

					<!-- Section Mode de jet (Normal / Avantage / Désavantage) -->
					<div class="roller-group">
						<label class="roller-label">Mode de jet :</label>
						<div class="radio-segmented-control">
							<label
								:class="{ active: customRollMode === 'normal' }"
								class="segmented-btn"
							>
								<input
									type="radio"
									value="normal"
									v-model="customRollMode"
								/>
								<span>Normal</span>
							</label>
							<label
								:class="{ active: customRollMode === 'advantage' }"
								class="segmented-btn mode-adv"
							>
								<input
									type="radio"
									value="advantage"
									v-model="customRollMode"
								/>
								<span>Avantage</span>
							</label>
							<label
								:class="{ active: customRollMode === 'disadvantage' }"
								class="segmented-btn mode-dis"
							>
								<input
									type="radio"
									value="disadvantage"
									v-model="customRollMode"
								/>
								<span>Désavantage</span>
							</label>
						</div>
					</div>

					<!-- Section Bonus / Malus avec raccourcis -->
					<div class="roller-group">
						<label class="roller-label">Modificateur (Bonus / Malus) :</label>
						<div class="bonus-input-wrapper">
							<input
								type="number"
								v-model.number="customBonus"
								class="num-input roller-bonus-input"
							/>
							<div class="quick-bonus-buttons">
								<button
									@click="customBonus -= 2"
									class="btn-quick-bonus"
								>
									-2
								</button>
								<button
									@click="customBonus -= 1"
									class="btn-quick-bonus"
								>
									-1
								</button>
								<button
									@click="customBonus = 0"
									class="btn-quick-bonus btn-reset"
								>
									0
								</button>
								<button
									@click="customBonus += 1"
									class="btn-quick-bonus"
								>
									+1
								</button>
								<button
									@click="customBonus += 2"
									class="btn-quick-bonus"
								>
									+2
								</button>
							</div>
						</div>
					</div>

					<!-- Case à cocher Masquer (Secret) -->
					<div class="roller-group">
						<label
							class="checkbox-secret-label"
							:class="{ 'is-secret': isRollSecret }"
						>
							<input
								type="checkbox"
								v-model="isRollSecret"
							/>
							<span>Masquer ce lancer (Réservé au MJ / Lancer Secret)</span>
						</label>
					</div>

					<hr class="roller-divider" />

					<!-- Grille de sélection des Dés -->
					<h4 class="roller-subtitle">Lancer un dé classique :</h4>
					<div class="dice-buttons-grid">
						<button
							@click="executeCustomRoll(4)"
							class="btn-dice"
						>
							<span class="dice-type">d4</span>
						</button>
						<button
							@click="executeCustomRoll(6)"
							class="btn-dice"
						>
							<span class="dice-type">d6</span>
						</button>
						<button
							@click="executeCustomRoll(8)"
							class="btn-dice"
						>
							<span class="dice-type">d8</span>
						</button>
						<button
							@click="executeCustomRoll(10)"
							class="btn-dice"
						>
							<span class="dice-type">d10</span>
						</button>
						<button
							@click="executeCustomRoll(12)"
							class="btn-dice"
						>
							<span class="dice-type">d12</span>
						</button>
						<button
							@click="executeCustomRoll(20)"
							class="btn-dice btn-dice-main"
						>
							<span class="dice-type">d20</span>
						</button>
						<button
							@click="executeCustomRoll(100)"
							class="btn-dice"
						>
							<span class="dice-type">d100</span>
						</button>
					</div>

					<!-- Optionnel : Formule Libre -->
					<div class="custom-formula-row">
						<label class="roller-label">Ou formule personnalisée :</label>
						<div class="formula-input-group">
							<input
								type="text"
								v-model="customFormulaInput"
								placeholder="Ex: 2d6 + 1d4 + 3"
								class="roller-text-input"
								@keyup.enter="handleFormulaSubmit"
							/>
							<button
								@click="handleFormulaSubmit"
								class="btn-formula-submit"
							>
								Lancer
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- ONGLET 4 : CHAT (Affiché en onglet classique si non détaché) -->
			<div
				v-else-if="!isChatDetached && activeTab === 'chat'"
				class="sheet-card"
			>
				<div class="chat-container">
					<div class="chat-header">
						<h3>Chat de la Table</h3>
						<!-- Bouton pour détacher / attacher le chat -->
						<button
							class="btn-detach"
							@click="toggleDetachChat"
						>
							Détacher Chat
						</button>
					</div>

					<!-- Zone d'affichage des messages -->
					<div
						class="chat-messages-box"
						ref="chatScrollContainer"
					>
						<div
							v-if="chatMessages.length === 0"
							class="chat-empty"
						>
							Aucun message pour l'instant. Discutez ou écrivez des actions ici !
						</div>
						<div
							v-for="msg in chatMessages"
							:key="msg.id"
							class="chat-message"
							:class="{
								'log-card': msg.isRoll,
								'chat-whisper': msg.isWhisper,
								'is-crit-success': msg.isCritSuccess,
								'is-crit-fail': msg.isCritFailure,
								'is-success': msg.isSuccess === true,
								'is-fail': msg.isSuccess === false,
								'is-secret-card': msg.isSecret,
							}"
							:style="{ backgroundColor: `${!msg.isRoll ? msg.senderColor + '20' : ''}` }"
						>
							<div
								class="chat-message-header"
								v-if="!msg.isRoll"
							>
								<span
									class="chat-author"
									:style="{ color: msg.senderColor }"
								>
									● {{ msg.senderName }}
								</span>
								<span
									v-if="msg.isWhisper"
									class="badge-whisper"
									>Chuchotement (MJ)</span
								>
								<span class="chat-time">{{ msg.timestamp }}</span>
							</div>
							<div
								class="chat-text"
								v-if="!msg.isRoll"
							>
								{{ msg.text }}
							</div>
							<div
								class="log-top"
								v-if="msg.isRoll"
							>
								<span
									class="player-tag"
									:style="{ color: msg.playerColor }"
								>
									● {{ msg.playerName }} ({{ msg.characterName }})
								</span>
								<div class="log-top-right">
									<span
										v-if="msg.isSecret"
										class="secret-badge"
										>Secret</span
									>
									<span class="time">{{ msg.timestamp.slice(0, 5) }}</span>
								</div>
							</div>

							<div
								class="log-content"
								v-if="msg.isRoll"
							>
								<span class="log-label">{{ msg.label }}</span>

								<div class="log-result-box">
									<span class="dice-val">{{ msg.diceResult }}</span>
									<span
										v-if="msg.statValue !== undefined"
										class="versus"
										>vs {{ msg.statValue }}</span
									>
								</div>
							</div>

							<div
								v-if="msg.details && msg.isRoll"
								class="log-details"
							>
								{{ msg.details }}
							</div>

							<div
								v-if="msg.isSuccess !== undefined && msg.isRoll"
								class="log-status"
							>
								<span
									v-if="msg.isCritSuccess"
									class="status-badge crit-success"
									>CRITIQUE !</span
								>
								<span
									v-else-if="msg.isCritFailure"
									class="status-badge crit-fail"
									>ÉCHEC CRITIQUE !</span
								>
								<span
									v-else-if="msg.isSuccess"
									class="status-badge success"
									>RÉUSSITE</span
								>
								<span
									v-else
									class="status-badge fail"
									>ÉCHEC</span
								>
							</div>
						</div>
					</div>

					<!-- Zone de saisie du message -->
					<div class="chat-input-area">
						<div class="chat-input-container">
							<!-- LISTE DE SUGGESTION DES COMMANDES -->
							<div
								v-if="filteredCommands.length > 0"
								class="command-suggestions"
								ref="selectedSuggestionRef"
							>
								<div
									v-for="(cmd, index) in filteredCommands"
									:key="cmd.name"
									class="suggestion-item"
									:class="{ active: index === selectedSuggestionIndex }"
									@click="selectCommand(cmd)"
									@mouseenter="selectedSuggestionIndex = index"
								>
									<div class="suggestion-header">
										<span class="cmd-name">{{ cmd.name }}</span>
										<span class="cmd-syntax">{{ cmd.syntax }}</span>
									</div>
									<div class="cmd-desc">{{ cmd.description }}</div>
									<div class="cmd-example">
										Ex: <code>{{ cmd.example }}</code>
									</div>
								</div>
							</div>

							<!-- INPUT DE CHAT -->
							<input
								v-model="newChatMessage"
								@keydown="handleKeydown"
								@keydown.enter="handleSendChat"
								class="roller-text-input"
								placeholder="Tapez un message ou / pour les commandes..."
							/>
						</div>
						<label
							class="chat-whisper-checkbox"
							v-if="!isGM"
						>
							<input
								type="checkbox"
								v-model="isChatWhisper"
							/>
							MJ
						</label>
						<button
							@click="handleSendChat"
							class="chat-btn-formula-submit"
						>
							Envoyer
						</button>
					</div>
				</div>
			</div>

			<div
				v-else-if="activeTab === 'gm-dashboard' && isGM"
				class="sheet-card"
			>
				<div class="gm-dashboard-container">
					<!-- SECTION 1 : LA COMPAGNIE (JOUEURS) -->
					<div class="chat-header">
						<h3>La Compagnie ({{ partySheets.filter((c) => c.ownerIds.length > 0).length }} personnages)</h3>
					</div>

					<div class="gm-global-infos">
						<p>
							Pv Global :
							{{
								partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc, char) => acc + (char.hpCurrent || 0), 0)
							}}
							/
							{{ partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc, char) => acc + (char.hpMax || 0), 0) }}
							({{
								(
									(partySheets
										.filter((c) => c.ownerIds.length > 0)
										.reduce((acc, char) => acc + (char.hpCurrent || 0), 0) /
										partySheets
											.filter((c) => c.ownerIds.length > 0)
											.reduce((acc, char) => acc + (char.hpMax || 0), 0)) *
									100
								).toFixed(0)
							}}%)
						</p>
						<p>
							Pe Global :
							{{
								partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc, char) => acc + (char.peCurrent || 0), 0)
							}}
							/
							{{ partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc, char) => acc + (char.peMax || 0), 0) }}
							({{
								Math.round(
									(partySheets
										.filter((c) => c.ownerIds.length > 0)
										.reduce((acc, char) => acc + (char.peCurrent || 0), 0) /
										partySheets
											.filter((c) => c.ownerIds.length > 0)
											.reduce((acc, char) => acc + (char.peMax || 0), 0)) *
										100,
								)
							}}%)
						</p>
						<div></div>
						<p>
							Blessures :
							{{
								partySheets
									.filter((c) => c.ownerIds.length > 0)
									.reduce((acc, char) => acc + (char.wounds?.filter((w: boolean) => w).length || 0), 0)
							}}
							/
							{{ partySheets.filter((c) => c.ownerIds.length > 0).length * 6 }}
							({{
								Math.round(
									(partySheets
										.filter((c) => c.ownerIds.length > 0)
										.reduce((acc, char) => acc + (char.wounds?.filter((w: boolean) => w).length || 0), 0) /
										(partySheets.filter((c) => c.ownerIds.length > 0).length * 6)) *
										100,
								)
							}}%)
						</p>
						<p>
							Moyenne :
							{{
								partySheets
									.filter((c) => c.ownerIds.length > 0)
									.reduce((acc, char) => acc + (char.wounds?.filter((w: boolean) => w).length || 0), 0)
							}}
							/ 6
						</p>
						<p>
							Mourants / KO :
							<span
								:class="{
									'text-danger': partySheets.filter((c) => c.ownerIds.length > 0 && (c.hpCurrent || 0) <= 0).length > 0,
								}"
							>
								{{ partySheets.filter((c) => c.ownerIds.length > 0 && (c.hpCurrent || 0) <= 0).length }}
							</span>
						</p>
						<p>
							Corruption :
							{{
								partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc, char) => acc + (char.corruption || 0), 0)
							}}
							/
							{{ partySheets.filter((c) => c.ownerIds.length > 0).length * 20 }}
							({{
								Math.round(
									(partySheets
										.filter((c) => c.ownerIds.length > 0)
										.reduce((acc, char) => acc + (char.corruption || 0), 0) /
										partySheets.filter((c) => c.ownerIds.length > 0).reduce((acc) => acc + 20, 0)) *
										100,
								)
							}}%)
						</p>
						<p>
							Moyenne :
							{{
								partySheets
									.filter((c) => c.ownerIds.length > 0)
									.reduce((acc, char) => acc + (char.corruption || 0), 0) /
								partySheets.filter((c) => c.ownerIds.length > 0).length
							}}
							/ 20
						</p>
						<p>
							Sombre :
							{{ partySheets.filter((c) => c.ownerIds.length > 0 && c.corruption >= 16).length }}
						</p>
					</div>

					<div class="party-grid">
						<div
							v-for="char in partySheets.filter((c) => c.ownerIds.length > 0)"
							:key="char.id"
							class="party-card"
							:class="{
								'party-char-dying': char.hpCurrent <= 0,
								'party-char-dead': char.hpCurrent <= 0 && char.wounds.every((v: boolean) => v === true),
							}"
						>
							<div class="party-card-header">
								<span class="party-char-name">{{ char.name || 'Inconnu' }}</span>
								<button
									@click="
										async () => {
											await focusAndSelectToken(char.id);
											activeTab = 'sheet';
											activeSubTab = 'favorites';
										}
									"
									class="btn-add"
									title="Sélectionner le token et ouvrir la fiche"
								>
									<Eye :size="12" /> Voir
								</button>
							</div>

							<div class="party-card-stats">
								<div class="stat-row">
									<span
										>PV : <strong>{{ char.hpCurrent || 0 }} / {{ char.hpMax || 0 }}</strong> ({{
											Math.round(((char.hpCurrent || 0) / (char.hpMax || 1)) * 100)
										}}%)</span
									>
								</div>
								<div class="stat-row">
									<span
										>PE : <strong>{{ char.peCurrent || 0 }} / {{ char.peMax || 0 }}</strong></span
									>
									<span>Corruption : {{ char.corruption }}</span>
								</div>
								<div class="stat-row gm-extra-info">
									<span
										>Prot:
										{{
											char.armors
												?.filter((a: any) => a.protection > 0 && a.equipped)
												.reduce((sum: any, a: any) => sum + a.protection, 0) || 0
										}}</span
									>
									<span>Blessures: {{ char.wounds?.filter((w: boolean) => w).length || 0 }}/6</span>
								</div>
								<div class="stat-row gm-extra-info">
									<span>Esquive: {{ Math.abs(dodgePenaltyChar(char)) || 0 }}</span>
									<span>Malus Dex: {{ protectionPenaltyChar(char).dexterity || 0 }}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- SECTION 2 : GESTION DE MASSE (PNJ / MONSTRES EN COMBAT) -->
					<div
						class="chat-header"
						style="margin-top: 20px"
					>
						<h3>Gestion des Monstres & PNJ ({{ partySheets.filter((c) => c.ownerIds.length === 0).length }})</h3>
					</div>

					<div class="party-grid">
						<div
							v-for="char in partySheets.filter((c) => c.ownerIds.length === 0)"
							:key="char.id"
							class="party-card monster-card"
						>
							<div class="party-card-header">
								<span class="party-char-name monster-title">{{ char.name || 'Monstre' }}</span>
								<div style="display: flex; gap: 4px">
									<button
										@click="
											async () => {
												await focusAndSelectToken(char.id);
												activeTab = 'sheet';
												activeSubTab = 'favorites';
											}
										"
										class="btn-add"
										title="Cibler sur la carte"
									>
										<Eye :size="12" />
									</button>
									<button
										@click="deleteMetadata(char)"
										class="btn-add btn-damage"
										title="Supprimer la fiche"
									>
										<Trash :size="12" />
									</button>
								</div>
							</div>

							<div class="party-card-stats">
								<!-- Modification rapide PV combat -->
								<div class="stat-row combat-row">
									<div class="combat-inputs">
										<span>PV :</span>
										<input
											type="number"
											v-model.number="char.hpCurrent"
											@change="saveCharacter(char)"
											class="num-input"
										/>
										<span>/</span>
										<input
											type="number"
											v-model.number="char.hpMax"
											@change="saveCharacter(char)"
											class="num-input"
										/>
										({{ Math.round((char.hpCurrent / char.hpMax) * 100) }}%)
									</div>
									<div class="hp-quick-buttons">
										<button
											@click="
												char.hpCurrent = Math.max(0, (char.hpCurrent || 0) - 1);
												saveCharacter(char);
											"
											class="btn-hp-mod"
										>
											-1
										</button>
										<button
											@click="
												char.hpCurrent = Math.min(char.hpMax || 0, (char.hpCurrent || 0) + 1);
												saveCharacter(char);
											"
											class="btn-hp-mod"
										>
											+1
										</button>
									</div>
								</div>

								<!-- Modification rapide PE combat -->
								<div class="stat-row combat-row">
									<div class="combat-inputs">
										<span>PE :</span>
										<input
											type="number"
											v-model.number="char.peCurrent"
											@change="saveCharacter(char)"
											class="num-input"
										/>
										<span>/</span>
										<input
											type="number"
											v-model.number="char.peMax"
											@change="saveCharacter(char)"
											class="num-input"
										/>
										({{ Math.round((char.peCurrent / char.peMax) * 100) }}%)
									</div>
									<div class="hp-quick-buttons">
										<button
											@click="
												char.peCurrent = Math.max(0, (char.peCurrent || 0) - 1);
												saveCharacter(char);
											"
											class="btn-hp-mod"
										>
											-1
										</button>
										<button
											@click="
												char.peCurrent = Math.min(char.peMax || 0, (char.peCurrent || 0) + 1);
												saveCharacter(char);
											"
											class="btn-hp-mod"
										>
											+1
										</button>
									</div>
								</div>
								<div class="stat-row gm-extra-info">
									<span
										>Prot:
										{{
											char.armors
												?.filter((a: any) => a.protection > 0 && a.equipped)
												.reduce((sum: any, a: any) => sum + a.protection, 0) || 0
										}}</span
									>
								</div>
								<div class="stat-row gm-extra-info">
									<span>Esquive: {{ Math.abs(dodgePenaltyChar(char)) || 0 }}</span>
									<span>Malus Dex: {{ protectionPenaltyChar(char).dexterity || 0 }}</span>
								</div>
								<div
									class="stat-row combat-row"
									style="margin-top: 6px; border-top: 1px dashed whitesmoke; padding-top: 4px"
								>
									<span>Actions rapides :</span>
									<div>
										<button
											@click="rollCustomDice(6, 'normal', 0, `Jet rapide MJ (${char.name})`, true, 1)"
											class="btn-hp-mod btn-secret-roll"
											title="Lancer un d6 secret"
										>
											d6
										</button>
										<button
											@click="rollCustomDice(20, 'normal', 0, `Jet rapide MJ (${char.name})`, true, 1)"
											class="btn-hp-mod btn-secret-roll"
											title="Lancer un d20 secret"
										>
											d20
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- ONGLET 5 : AIDE / RÈGLES -->
			<div
				v-else-if="activeTab === 'help'"
				class="sheet-card"
			>
				<div class="help-container">
					<h3>Tableau de Progression des Maîtrises</h3>
					<p class="help-subtitle">
						Récapitulatif des bonus obtenus selon le rang et l'XP accumulée dans une maîtrise.
					</p>

					<div class="table-wrapper">
						<table class="rules-table">
							<thead>
								<tr>
									<th>Rang</th>
									<th>XP Cumul.</th>
									<th>Dé Bonus</th>
									<th>Bonus Touche</th>
									<th>Total PV</th>
									<th>Dons</th>
									<th>Attr. Bonus</th>
									<th>Pts Comp./Mag.</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><span class="rank-pill rank-e">E</span></td>
									<td>0</td>
									<td>Aucun</td>
									<td>0</td>
									<td>0</td>
									<td>0</td>
									<td>0</td>
									<td>0</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-d">D</span></td>
									<td>15</td>
									<td>1D4</td>
									<td>1 (+1)</td>
									<td>0</td>
									<td>0</td>
									<td>0</td>
									<td>0</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-c">C</span></td>
									<td>35</td>
									<td>1D6</td>
									<td>1</td>
									<td>0</td>
									<td>1 (+1)</td>
									<td>0</td>
									<td>1</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-b">B</span></td>
									<td>65</td>
									<td>1D8</td>
									<td>2 (+1)</td>
									<td>20 (+20)</td>
									<td>1</td>
									<td>1 (+1)</td>
									<td>2 (+1)</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-a">A</span></td>
									<td>110</td>
									<td>1D10</td>
									<td>2</td>
									<td>40 (+20)</td>
									<td>2 (+1)</td>
									<td>1</td>
									<td>3 (+1)</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-s">S</span></td>
									<td>180</td>
									<td>1D12</td>
									<td>3 (+1)</td>
									<td>60 (+20)</td>
									<td>2</td>
									<td>2 (+1)</td>
									<td>4 (+1)</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-m">M</span></td>
									<td>275</td>
									<td>1D20</td>
									<td>3</td>
									<td>80 (+20)</td>
									<td>3 (+1)</td>
									<td>2</td>
									<td>6 (+2)</td>
								</tr>
								<tr>
									<td><span class="rank-pill rank-h">H</span></td>
									<td>400</td>
									<td>2D12</td>
									<td>4 (+1)</td>
									<td>100 (+20)</td>
									<td>3</td>
									<td>3 (+1)</td>
									<td>7 (+1)</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</main>

		<!-- COLONNE CHAT PERMANENTE (S'affiche uniquement si le chat est détaché) -->
		<aside
			v-if="isChatDetached"
			class="detached-chat-pane"
		>
			<div class="chat-pane-header">
				<div class="header-titles">
					<span>Chat en direct</span>
				</div>
				<div class="header-actions">
					<!-- Bouton pour inverser Gauche / Droite -->
					<button
						@click="toggleChatPosition"
						class="btn-icon"
						:title="`Placer à ${chatPosition === 'right' ? 'gauche' : 'droite'}`"
					>
						<ArrowLeft
							:size="14"
							v-if="chatPosition === 'right'"
						/>
						<ArrowRight
							:size="14"
							v-else
						/>
					</button>
					<!-- Bouton pour refermer et raccrocher le chat -->
					<button
						@click="toggleDetachChat"
						class="btn-icon btn-close"
						title="Raccrocher le chat"
					>
						X
					</button>
				</div>
			</div>

			<!-- Contenu du Chat réutilisé dans la colonne latérale -->
			<div class="chat-container detached-chat-body">
				<div
					class="chat-messages-box"
					ref="chatScrollContainer"
				>
					<div
						v-if="chatMessages.length === 0"
						class="chat-empty"
					>
						Aucun message pour l'instant. Discutez ou écrivez des actions ici !
					</div>
					<div
						v-for="msg in chatMessages"
						:key="msg.id"
						class="chat-message"
						:class="{
							'log-card': msg.isRoll,
							'chat-whisper': msg.isWhisper,
							'is-crit-success': msg.isCritSuccess,
							'is-crit-fail': msg.isCritFailure,
							'is-success': msg.isSuccess === true,
							'is-fail': msg.isSuccess === false,
							'is-secret-card': msg.isSecret,
						}"
						:style="{ backgroundColor: `${!msg.isRoll ? msg.senderColor + '20' : ''}` }"
					>
						<div
							class="chat-message-header"
							v-if="!msg.isRoll"
						>
							<span
								class="chat-author"
								:style="{ color: msg.senderColor }"
							>
								● {{ msg.senderName }}
							</span>
							<span
								v-if="msg.isWhisper"
								class="badge-whisper"
								>Chuchotement (MJ)</span
							>
							<span class="chat-time">{{ msg.timestamp }}</span>
						</div>
						<div
							class="chat-text"
							v-if="!msg.isRoll"
						>
							{{ msg.text }}
						</div>
						<div
							class="log-top"
							v-if="msg.isRoll"
						>
							<span
								class="player-tag"
								:style="{ color: msg.playerColor }"
							>
								● {{ msg.playerName }} ({{ msg.characterName }})
							</span>
							<div class="log-top-right">
								<span
									v-if="msg.isSecret"
									class="secret-badge"
									>Secret</span
								>
								<span class="time">{{ msg.timestamp.slice(0, 5) }}</span>
							</div>
						</div>

						<div
							class="log-content"
							v-if="msg.isRoll"
						>
							<span class="log-label">{{ msg.label }}</span>

							<div class="log-result-box">
								<span class="dice-val">{{ msg.diceResult }}</span>
								<span
									v-if="msg.statValue !== undefined"
									class="versus"
									>vs {{ msg.statValue }}</span
								>
							</div>
						</div>

						<div
							v-if="msg.details && msg.isRoll"
							class="log-details"
						>
							{{ msg.details }}
						</div>

						<div
							v-if="msg.isSuccess !== undefined && msg.isRoll"
							class="log-status"
						>
							<span
								v-if="msg.isCritSuccess"
								class="status-badge crit-success"
								>CRITIQUE !</span
							>
							<span
								v-else-if="msg.isCritFailure"
								class="status-badge crit-fail"
								>ÉCHEC CRITIQUE !</span
							>
							<span
								v-else-if="msg.isSuccess"
								class="status-badge success"
								>RÉUSSITE</span
							>
							<span
								v-else
								class="status-badge fail"
								>ÉCHEC</span
							>
						</div>
					</div>
				</div>

				<!-- Zone de saisie du message -->
				<div class="chat-input-area">
					<div class="chat-input-container">
						<!-- LISTE DE SUGGESTION DES COMMANDES -->
						<div
							v-if="filteredCommands.length > 0"
							class="command-suggestions"
							ref="selectedSuggestionRef"
						>
							<div
								v-for="(cmd, index) in filteredCommands"
								:key="cmd.name"
								class="suggestion-item"
								:class="{ active: index === selectedSuggestionIndex }"
								@click="selectCommand(cmd)"
								@mouseenter="selectedSuggestionIndex = index"
							>
								<div class="suggestion-header">
									<span class="cmd-name">{{ cmd.name }}</span>
									<span class="cmd-syntax">{{ cmd.syntax }}</span>
								</div>
								<div class="cmd-desc">{{ cmd.description }}</div>
								<div class="cmd-example">
									Ex: <code>{{ cmd.example }}</code>
								</div>
							</div>
						</div>

						<!-- INPUT DE CHAT -->
						<input
							v-model="newChatMessage"
							@keydown="handleKeydown"
							@keydown.enter="handleSendChat"
							class="roller-text-input"
							placeholder="Tapez un message ou / pour les commandes..."
						/>
					</div>
					<label
						class="chat-whisper-checkbox"
						v-if="!isGM"
					>
						<input
							type="checkbox"
							v-model="isChatWhisper"
						/>
						MJ
					</label>
					<button
						@click="handleSendChat"
						class="chat-btn-formula-submit"
					>
						Envoyer
					</button>
				</div>
			</div>
		</aside>
	</div>
</template>

<style scoped>
/* 1. VERRU : Empêche le conteneur global de scroller */
.app-container {
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
	color: #f3f4f6;
	padding: 10px;
	box-sizing: border-box;
	display: flex;
	width: 100%;
	height: 100vh; /* Bloque la hauteur à la fenêtre OBR */
	overflow: hidden !important; /* Empêche strictement le scroll global externe */
	transition: all 300ms ease-in-out;
}

/* Mode Split (Colonnes) */
.app-container.is-split {
	gap: 10px;
}

/* 2. FICHE / DASHBOARD : C'est la SEULE zone qui a le droit de scroller */
.main-content {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-width: 380px;
	height: 100%;
	overflow-y: auto; /* La fiche défile ici et nulle part d'autre */
	padding-right: 4px; /* Espace pour éviter que la barre de scroll ne chevauche le contenu */
}

/* 3. COLONNE CHAT : Fixe et verrouillée en hauteur */
.detached-chat-pane {
	width: 340px;
	height: 100%; /* S'aligne parfaitement sur la hauteur du conteneur parent */
	border-left: 1px solid #374151;
	display: flex;
	flex-direction: column;
	background-color: #111827;
	border-radius: 6px;
	padding: 6px;
	box-sizing: border-box;
	flex-shrink: 0; /* Empêche le chat de se faire écraser si la fenêtre retrécit */
	overflow: hidden; /* Pas de scroll sur la colonne elle-même */
}

/* Inversion de position (Gauche / Droite) */
.app-container.chat-left .detached-chat-pane {
	order: -1;
	border-left: none;
	border-right: 1px solid #374151;
}

.chat-pane-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 4px 8px;
	background: #1f2937;
	border-radius: 4px;
	margin-bottom: 6px;
	font-size: 0.8rem;
	font-weight: bold;
	color: #38bdf8;
	flex-shrink: 0;
}

.detached-chat-pane {
	width: 340px;
	height: 100%;
	border-left: 1px solid #374151;
	display: flex;
	flex-direction: column;
	background-color: #111827;
	border-radius: 6px;
	padding: 6px;
	box-sizing: border-box;
	flex-shrink: 0;
	overflow: hidden; /* Bloque tout scroll sur la boîte principale du aside */
}

/* Corps interne du chat détaché */
.detached-chat-body {
	display: flex;
	flex-direction: column;
	flex: 1;
	height: calc(100% - 35px);
	overflow: hidden;
	gap: 8px;
}

/* La boîte de message défile uniquement à l'intérieur */
.detached-chat-body .chat-messages-box {
	flex: 1;
	overflow-y: auto !important;
	max-height: none !important;
}

.character-selector-bar {
	background: #111827;
	border: 1px solid #374151;
	border-radius: 6px;
	padding: 8px 12px;
	margin-bottom: 12px;
	display: flex;
	align-items: center;
	gap: 10px;
}

.selector-label {
	font-size: 0.8rem;
	font-weight: bold;
	color: #38bdf8;
	display: flex;
	align-items: center;
	gap: 6px;
	white-space: nowrap;
}

.character-select {
	background: #1f2937;
	color: #fff;
	border: 1px solid #4b5563;
	border-radius: 4px;
	padding: 4px 8px;
	font-size: 0.85rem;
	font-weight: bold;
	flex: 1;
	cursor: pointer;
}

.character-select:hover {
	border-color: #38bdf8;
}

.header-actions {
	display: flex;
	gap: 4px;
}

.btn-icon {
	background: #374151;
	border: none;
	color: #fff;
	cursor: pointer;
	font-size: 0.8rem;
	padding: 2px 6px;
	border-radius: 4px;
}

.btn-icon:hover {
	background: #4b5563;
}

.btn-detach {
	margin-left: auto;
	font-size: 0.75rem;
	background: #1f2937;
	border: 1px solid #374151;
	color: #9ca3af;
	border-radius: 4px;
	cursor: pointer;
	padding: 2px 8px;
	transition: all 300ms ease-in-out;
}

.btn-detach:hover {
	color: #fff;
	background: #3b82f6;
	border-color: #3b82f6;
}

.modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: rgba(0, 0, 0, 0.7);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 999;
}

.modal-card {
	background: #1f2937;
	border: 1px solid #374151;
	border-radius: 8px;
	padding: 16px;
	width: 300px;
	text-align: center;
}

.modal-card h3 {
	margin-top: 0;
	color: #38bdf8;
}

.modal-actions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 16px 0;
}

.btn-modal {
	padding: 8px 12px;
	border: none;
	border-radius: 6px;
	font-weight: bold;
	cursor: pointer;
	color: #fff;
	transition: all 300ms ease-in-out;
}

.btn-pj {
	background: #2563eb;
}
.btn-pj:hover {
	background: #1d4ed8;
}

.btn-monster {
	background: #dc2626;
}
.btn-monster:hover {
	background: #b91c1c;
}

.btn-cancel {
	background: transparent;
	border: none;
	color: #9ca3af;
	cursor: pointer;
	font-size: 0.8rem;
}

.sheet-io-actions {
	display: flex;
	gap: 8px;
	margin-bottom: 12px;
	padding-bottom: 8px;
	border-bottom: 1px solid #374151;
}

.btn-io {
	background: #1f2937;
	color: #38bdf8;
	border: 1px solid #374151;
	border-radius: 4px;
	padding: 4px 8px;
	font-size: 0.75rem;
	font-weight: bold;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	transition:
		background 0.2s,
		border-color 0.2s;
}

.btn-io:hover {
	background: #374151;
	border-color: #38bdf8;
}

.input-disabled {
	opacity: 0.8;
	cursor: not-allowed;
	border-bottom-style: dashed !important;
}

.lock-tag {
	font-size: 0.7rem;
	background: #374151;
	color: #fcd34d;
	padding: 2px 6px;
	border-radius: 4px;
	margin-left: 6px;
}

.tabs-navigation {
	display: flex;
	gap: 6px;
	margin-bottom: 12px;
	border-bottom: 2px solid #374151;
	padding-bottom: 4px;
	align-items: center;
}
.tab-btn {
	background: #111827;
	color: #9ca3af;
	border: 1px solid #374151;
	border-bottom: none;
	padding: 6px 12px;
	border-top-left-radius: 6px;
	border-top-right-radius: 6px;
	font-size: 0.8rem;
	font-weight: bold;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 6px;
}
.tab-btn.active {
	background: #1f2937;
	color: #38bdf8;
	border-color: #3b82f6;
}
.tab-badge {
	background: #3b82f6;
	color: white;
	font-size: 0.65rem;
	padding: 1px 5px;
	border-radius: 10px;
}

.secret-toggle-bar {
	background: #111827;
	border: 1px solid #4338ca;
	border-radius: 6px;
	padding: 6px 8px;
	display: flex;
	align-items: center;
	flex: 1;
}
.checkbox-secret-label {
	font-size: 0.75rem;
	font-weight: bold;
	color: #a5b4fc;
	display: flex;
	align-items: center;
	gap: 6px;
	cursor: pointer;
}

.status-msg {
	text-align: center;
	color: #9ca3af;
	margin-top: 20px;
}
.sheet-card {
	background: #1f2937;
	border-radius: 8px;
	padding: 14px;
	border: 1px solid #374151;
	transition: all 0.3s ease;
}

.sheet-dead {
	background: #991b1b60;
	border-radius: 8px;
	padding: 14px;
	border: 1px solid #374151;
}
.sheet-corrupted {
	background: #31104260;
	border-radius: 8px;
	padding: 14px;
	border: 1px solid #374151;
}
.header {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
}
.name-input {
	background: transparent;
	border: none;
	border-bottom: 2px solid #4b5563;
	color: #fff;
	font-size: 1.1rem;
	font-weight: bold;
	width: 100%;
}

.species-selector-box {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}
.species-label {
	font-size: 0.8rem;
	font-weight: bold;
	color: #a7f3d0;
	display: flex;
	align-items: center;
	gap: 4px;
	white-space: nowrap;
}
.species-select {
	background: #111827;
	color: white;
	border: 1px solid #4b5563;
	border-radius: 4px;
	padding: 3px 6px;
	font-size: 0.8rem;
	flex: 1;
}

/* INFO GRID (TALENT & MÉTIER) */
.info-row-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	margin-bottom: 10px;
}

.talent-box {
	background: #111827;
	border-left: 3px solid #10b981;
	padding: 6px 8px;
	border-radius: 4px;
	display: flex;
	flex-direction: column;
	justify-content: center;
}
.talent-title {
	font-size: 0.75rem;
	font-weight: bold;
	color: #34d399;
	display: flex;
	align-items: center;
	gap: 4px;
}
.talent-desc {
	font-size: 0.7rem;
	color: #d1d5db;
	margin-top: 2px;
}

.profession-box {
	background: #111827;
	border-left: 3px solid #f59e0b;
	padding: 6px 8px;
	border-radius: 4px;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
}
.profession-header {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 2px;
}
.profession-label {
	font-size: 0.72rem;
	font-weight: bold;
	color: #fbbf24;
	white-space: nowrap;
	display: flex;
	align-items: center;
	gap: 4px;
}
.profession-name-input {
	background: #1f2937;
	border: 1px solid #4b5563;
	color: #fff;
	border-radius: 4px;
	padding: 1px 4px;
	font-size: 0.72rem;
	font-weight: bold;
	flex: 1;
}
.profession-desc-input {
	background: #1f2937;
	border: 1px solid #374151;
	color: #d1d5db;
	border-radius: 4px;
	padding: 2px 4px;
	font-size: 0.68rem;
	width: 100%;
	box-sizing: border-box;
}
.dodge-banner {
	background: #111827;
	border: 1px solid #3b82f6;
	border-radius: 6px;
	padding: 6px 10px;
	margin-bottom: 12px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin: auto;
	margin-bottom: 4px;
	margin-top: 16px;
	width: 240px;
}
.dodge-title {
	font-size: 0.75rem;
	font-weight: bold;
	color: #60a5fa;
	display: flex;
	align-items: center;
	gap: 4px;
}
.dodge-text {
	font-size: 0.75rem;
	color: #d1d5db;
}
.dodge-val {
	font-weight: bold;
}
.dodge-val.has-penalty {
	color: #f87171;
}

.protection-banner {
	background: #111827;
	border: 1px solid #10b981;
	border-radius: 6px;
	padding: 6px 10px;
	margin-bottom: 12px;
	display: grid;
	grid-template-columns: 1fr 1fr;
	justify-content: space-between;
	align-items: center;
	margin: auto;
	margin-bottom: 24px;
	width: 320px;
}
.protection-title {
	font-size: 0.75rem;
	font-weight: bold;
	color: #10b981;
	display: flex;
	align-items: center;
	gap: 4px;
}
.protection-text {
	font-size: 0.75rem;
	color: #d1d5db;
}
.protection-val {
	font-weight: bold;
}
.protection-val.has-penalty {
	color: #f87171;
}

.equipped-section {
	background: #1f2937;
	border: 1px solid #374151;
	border-radius: 6px;
	margin-bottom: 12px;
	overflow: hidden;
	margin-bottom: 24px;
}

.accordion-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px 12px;
	background: #111827;
	cursor: pointer;
	user-select: none;
	transition: background 0.2s;
}

.accordion-header:hover {
	background: #1f2937;
}

.accordion-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.85rem;
	font-weight: bold;
	color: #38bdf8;
}

.equipped-weapons {
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.equipped-quick-expanded-desc {
	font-size: 0.7rem;
	color: #d1d5db;
	margin-top: 4px;
	background-color: #2563eb60;
	padding: 4px 6px;
	border-radius: 4px;
}

.section-title {
	font-size: 0.8rem;
	text-transform: uppercase;
	color: #9ca3af;
	margin: 14px 0 8px 0;
	border-bottom: 1px solid #374151;
	padding-bottom: 4px;
}

/* TOP STATUS GRID */
.top-status-grid {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 24px;
	margin-top: 24px;
}

.resources-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.resource-box {
	background: #111827;
	padding: 6px 8px;
	border-radius: 6px;
	border: 1px solid #374151;
}

.resource-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 0.75rem;
	font-weight: bold;
	margin-bottom: 3px;
}
.resource-header span {
	display: flex;
	align-items: center;
	gap: 4px;
}
.icon-hp {
	color: #ef4444;
}
.icon-pe {
	color: #3b82f6;
}

.inputs-inline {
	display: flex;
	align-items: center;
	gap: 3px;
}

.num-input {
	width: 38px;
	background: #1f2937;
	border: 1px solid #4b5563;
	color: #fff;
	text-align: center;
	border-radius: 4px;
	padding: 1px 2px;
	font-size: 0.75rem;
	font-weight: bold;
}

.btn-est {
	background: #374151;
	color: #60a5fa;
	border: none;
	font-size: 0.6rem;
	padding: 1px 3px;
	border-radius: 3px;
}

.bar-controls {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 8px;
}

.bar-background {
	background: #374151;
	height: 6px;
	border-radius: 3px;
	overflow: hidden;
	flex: 1;
}

.bar-fill {
	height: 100%;
	transition: width 0.3s ease;
}

.hp-fill {
	background: #ef4444;
}
.pe-fill {
	background: #3b82f6;
}

.resource-controls {
	display: flex;
	justify-content: flex-end;
	gap: 3px;
}

.resource-controls button {
	background: #374151;
	color: white;
	border: none;
	border-radius: 3px;
	padding: 1px 5px;
	font-size: 0.65rem;
	cursor: pointer;
}

/* STATUS SIDE */
.status-side-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
}

.wounds-section {
	background: #111827;
	padding: 6px 8px;
	border-radius: 6px;
	border: 1px solid #374151;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
}

.wounds-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.wounds-label {
	font-size: 0.75rem;
	font-weight: bold;
	color: #fca5a5;
	display: flex;
	align-items: center;
	gap: 4px;
}
.icon-wound {
	color: #f87171;
}

.wounds-grid {
	display: flex;
	gap: 16px;
	margin-top: 4px;
	align-items: center;
}

.wound-box {
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
}

.wound-indicator {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 2px solid #6b7280;
	background: #1f2937;
	display: inline-block;
	transition: all 0.2s;
}
.wound-indicator.is-wounded {
	background: #ef4444;
	border-color: #f87171;
	box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

.corruption-section {
	background: #111827;
	padding: 6px 8px;
	border-radius: 6px;
	border: 1px solid #374151;
	display: flex;
	flex-direction: column;
}

.corruption-header {
	display: flex;
	align-items: center;
	gap: 6px;
}

.corr-title {
	font-size: 0.72rem;
	font-weight: bold;
	color: #c084fc;
	display: flex;
	align-items: center;
	gap: 4px;
}

.corr-input {
	width: 42px;
}

.corr-badge {
	font-size: 0.65rem;
	font-weight: bold;
	padding: 2px 6px;
	border-radius: 4px;
	text-transform: uppercase;
}

.status-pur {
	background: #065f46;
	color: #a7f3d0;
	border: 1px solid #10b981;
}
.status-entache {
	background: #854d0e;
	color: #fef08a;
	border: 1px solid #eab308;
}
.status-sombre {
	background: #9a3412;
	color: #fed7aa;
	border: 1px solid #f97316;
}
.status-perdu {
	background: #881337;
	color: #fecdd3;
	border: 1px solid #f43f5e;
}

.corr-effect {
	font-size: 0.65rem;
	color: #d1d5db;
	margin-top: 3px;
	line-height: 1.1;
}
.stats-section {
	background: #1f2937;
	border: 1px solid #374151;
	border-radius: 6px;
	margin-bottom: 12px;
	overflow: hidden;
}

.stats-section .stats-grid {
	padding: 8px;
}

.stats-grid {
	display: grid;
	grid-template-columns: 240px 240px;
	gap: 8px;
	justify-self: center;
}
.stat-box {
	background: #111827;
	padding: 8px;
	border-radius: 6px;
}
.stat-main-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid #374151;
	padding-bottom: 4px;
}
.stat-name-title {
	font-size: 1rem;
	color: white;
	font-weight: bold;
	display: flex;
	align-items: center;
	gap: 56px;
	text-transform: uppercase;
}
.with-tooltip {
	cursor: help;
}
.inline-icon {
	color: #60a5fa;
}
.btn-roll-dice {
	background: transparent;
	border: none;
	font-size: 0.9rem;
	cursor: pointer;
	padding: 0;
	color: #9ca3af;
	transition:
		transform 0.1s ease,
		color 0.1s;
}
.btn-roll-dice:hover {
	transform: scale(1.15);
	color: #38bdf8;
}

.stat-controls {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	margin-top: 4px;
}
.stat-input {
	width: 40px;
	background: #1f2937;
	border: 1px solid #4b5563;
	color: #fff;
	text-align: center;
	border-radius: 4px;
	padding: 2px;
	font-size: 0.9rem;
	font-weight: bold;
}
.btn-step {
	background: #374151;
	color: white;
	border: none;
	border-radius: 4px;
	width: 22px;
	height: 22px;
	cursor: pointer;
}
.racial-bonus-hint {
	font-size: 0.65rem;
	color: #a7f3d0;
	margin-top: 2px;
	font-weight: bold;
	text-align: center;
}

.mastery-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: #1f2937;
	padding: 6px 8px;
	border-radius: 4px;
	margin-bottom: 4px;
	font-size: 0.8rem;
	border: 1px solid #374151;
}
.weapon-name {
	width: 55px;
	font-weight: bold;
}
.xp-input-wrapper {
	display: flex;
	align-items: center;
	gap: 2px;
}
.xp-input {
	width: 50px;
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	text-align: center;
	border-radius: 4px;
	padding: 2px;
	font-size: 0.75rem;
}
.xp-unit {
	font-size: 0.65rem;
	color: #9ca3af;
}
.rank-badge-box {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	min-width: 90px;
}
.rank-tag {
	font-size: 0.75rem;
	font-weight: bold;
	color: #38bdf8;
}
.rank-details {
	font-size: 0.65rem;
	color: #9ca3af;
}

/* SOUS-ONGLETS */
.subtabs-navigation {
	display: flex;
	gap: 4px;
	margin-top: 16px;
	border-bottom: 2px solid #374151;
	overflow-x: auto;
	padding-bottom: 4px;
}
.subtab-btn {
	background: #111827;
	color: #9ca3af;
	border: 1px solid #374151;
	border-bottom: none;
	padding: 5px 8px;
	border-top-left-radius: 5px;
	border-top-right-radius: 5px;
	font-size: 0.72rem;
	font-weight: bold;
	cursor: pointer;
	white-space: nowrap;
}
.subtab-btn.active {
	background: #374151;
	color: #a7f3d0;
	border-color: #10b981;
}
.fav-tab-btn {
	color: #f59e0b;
}
.fav-tab-btn.active {
	color: #fcd34d;
	border-color: #f59e0b;
}
.fav-icon-tab {
	margin-right: 2px;
	vertical-align: middle;
}

.subtab-content {
	background: #111827;
	padding: 10px;
	border-radius: 0 0 6px 6px;
	border: 1px solid #374151;
	border-top: none;
	margin-bottom: 12px;
}
.sub-section-title {
	margin: 0 0 8px 0;
	font-size: 0.8rem;
	color: #f3f4f6;
}

/* STYLES DE L'ONGLET FAVORIS RAPIDE */
.favorites-quick-container {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.fav-quick-card {
	background: #1f2937;
	border: 1px solid #3b82f6;
	border-radius: 6px;
	padding: 6px 8px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.drag-handle {
	cursor: grab;
	color: #6b7280;
	font-size: 1rem;
	user-select: none;
	display: flex;
	align-items: center;
}
.drag-handle:active {
	cursor: grabbing;
}

.fav-quick-header {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.75rem;
}

.fav-quick-type {
	background: #111827;
	color: #60a5fa;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.65rem;
	font-weight: bold;
	display: flex;
	align-items: center;
	gap: 3px;
}
.fav-quick-name {
	font-weight: bold;
	color: #fff;
	flex: 1;
}
.fav-quick-info {
	font-size: 0.65rem;
	color: #9ca3af;
	display: flex;
	align-items: center;
}
.fav-quick-desc {
	font-size: 0.68rem;
	color: #9ca3af;
	background: #111827;
	padding: 3px 6px;
	border-radius: 4px;
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.fav-quick-expanded-desc {
	font-size: 0.7rem;
	color: #d1d5db;
	background: #111827;
	border-left: 2px solid #38bdf8;
	padding: 4px 8px;
	border-radius: 4px;
	margin-top: 2px;
	white-space: pre-line;
	transition: all 300ms ease-in-out;
}
.fav-quick-actions {
	display: flex;
	gap: 6px;
	margin: 2px 20px;
	justify-content: space-between;
	transition: all 300ms ease-in-out;
}

.fav-quick-actions-container {
	display: flex;
	gap: 6px;
	justify-content: space-between;
	transition: all 300ms ease-in-out;
}

/* BOUTON TOGGLE DESCRIPTION */
.btn-toggle-desc {
	background: #374151;
	color: #9ca3af;
	border: none;
	border-radius: 4px;
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition:
		background 0.1s,
		color 0.1s;
}
.btn-toggle-desc:hover {
	background: #4b5563;
	color: #fff;
}

/* BOUTON SUPPRIMER DU FAVORI */
.btn-remove-fav {
	background: #7f1d1d;
	color: #fca5a5;
	border: none;
	border-radius: 4px;
	width: 20px;
	height: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background 0.1s;
}
.btn-remove-fav:hover {
	background: #991b1b;
	color: #fff;
}

/* BOUTON UTILISER */
.btn-use-item {
	background: #059669;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 2px 6px;
	font-size: 0.65rem;
	font-weight: bold;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 3px;
}
.btn-use-item:hover {
	background: #10b981;
}
.btn-use-item.disabled {
	background: #374151;
	color: #6b7280;
	cursor: not-allowed;
}
.formula-tag {
	color: #38bdf8;
	font-weight: bold;
}

/* BOUTON ÉTOILE FAVORI SUR LES CARTES */
.btn-fav {
	background: transparent;
	border: none;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	color: #6b7280;
	transition:
		transform 0.1s,
		color 0.1s;
}
.btn-fav:hover {
	transform: scale(1.2);
	color: #f59e0b;
}
.btn-fav.active {
	color: #f59e0b;
}

.dynamic-section-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
}
.btn-add {
	background: #059669;
	color: white;
	border: none;
	border-radius: 4px;
	padding: 2px 8px;
	font-size: 0.7rem;
	font-weight: bold;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 2px;
	margin-left: auto;
}
.btn-add:hover {
	background: #10b981;
}

.dynamic-card {
	background: #1f2937;
	border-radius: 6px;
	padding: 8px;
	margin-bottom: 6px;
	border: 1px solid #374151;
}
.card-top {
	display: flex;
	gap: 6px;
	align-items: center;
	margin-bottom: 4px;
}
.card-title-input {
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	font-weight: bold;
	font-size: 0.8rem;
	border-radius: 4px;
	padding: 2px 6px;
	width: 100%;
}

.card-row-inputs {
	display: flex;
	gap: 8px;
	margin-bottom: 6px;
	font-size: 0.7rem;
	color: #9ca3af;
	flex-wrap: wrap;
	align-items: center;
}
.card-row-inputs label {
	display: flex;
	align-items: center;
	gap: 4px;
}

.small-num-input {
	width: 36px;
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	text-align: center;
	border-radius: 4px;
	font-size: 0.75rem;
	padding: 1px;
}
.small-text-input {
	width: 65px;
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	border-radius: 4px;
	font-size: 0.75rem;
	padding: 1px 4px;
}
.small-select {
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	border-radius: 4px;
	font-size: 0.75rem;
	padding: 1px;
}

.weapon-roll-actions {
	display: flex;
	gap: 6px;
	margin-top: 6px;
	justify-content: center;
}
.btn-weapon-roll {
	border: none;
	border-radius: 4px;
	padding: 4px 16px;
	font-size: 0.7rem;
	font-weight: bold;
	cursor: pointer;
	color: white;
	transition: all 300ms ease-in-out;
	min-width: 33%;
}
.btn-attack {
	background: #2563eb;
}
.btn-attack:hover {
	background: #1d4ed8;
}
.btn-damage {
	/* background: #dc2626; */
	background: transparent;
	padding: 4px 6px;
	min-width: 0px;
}

.btn-damage:hover {
	background: #b91c1c;
}
.btn-spell-cast {
	background: #7c3aed;
}
.btn-spell-cast:hover {
	background: #6d28d9;
}
.btn-spell-effect {
	background: transparent;
	padding: 4px 6px;
	min-width: 0px;
}
.btn-spell-effect:hover {
	background: #047857;
}

/* ROLLER */
.roller-container {
	display: flex;
	flex-direction: column;
	gap: 12px;
}
.roller-container h3 {
	font-size: 0.95rem;
	margin: 0;
	color: #f3f4f6;
	border-bottom: 1px solid #374151;
	padding-bottom: 6px;
}
.roller-label {
	font-size: 0.75rem;
	font-weight: bold;
	color: #9ca3af;
}
.roller-text-input {
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	border-radius: 4px;
	padding: 10px;
	font-size: 0.8rem;
	width: 100%;
	box-sizing: border-box;
}
.roller-bonus-input {
	width: 70px;
}
.roller-subtitle {
	font-size: 0.8rem;
	color: #38bdf8;
	margin: 8px 0 4px 0;
}
.dice-buttons-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
}
.btn-dice {
	background: #374151;
	color: white;
	border: 1px solid #4b5563;
	border-radius: 6px;
	padding: 10px 0;
	font-size: 0.9rem;
	font-weight: bold;
	cursor: pointer;
	transition: all 0.1s ease;
}
.btn-dice:hover {
	transform: translateY(-2px);
	background: #4b5563;
	border-color: #60a5fa;
}
.btn-dice-main {
	background: linear-gradient(135deg, #2563eb, #3730a3);
	border-color: #3b82f6;
}
.btn-dice-main:hover {
	background: #1d4ed8;
	transform: translateY(-2px);
}
.roller-container {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 10px;
}

.roller-header h3 {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0;
}

.roller-grid-2col {
	display: grid;
	grid-template-columns: 2fr 1fr;
	gap: 12px;
}

.roller-group {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

/* Control segmenté pour Normal / Avantage / Désavantage */
.radio-segmented-control {
	display: flex;
	background: #374151;
	border-radius: 8px;
	padding: 3px;
	border: 1px solid #27272a;
}

.segmented-btn {
	flex: 1;
	text-align: center;
	padding: 6px 10px;
	font-size: 0.8rem;
	cursor: pointer;
	border-radius: 6px;
	transition: all 0.2s ease;
	user-select: none;
}

.segmented-btn input {
	display: none;
}

.segmented-btn.active {
	background: linear-gradient(135deg, #2563eb, #3730a3);
	color: #fff;
	font-weight: bold;
}

.segmented-btn.mode-adv.active {
	background: linear-gradient(135deg, #10b981, #15803d);
}

.segmented-btn.mode-dis.active {
	background: linear-gradient(135deg, #b91c1c80, #7f1d1d);
}

/* Modificateur avec boutons rapides */
.bonus-input-wrapper {
	display: flex;
	gap: 8px;
	align-items: center;
}

.quick-bonus-buttons {
	display: flex;
	gap: 4px;
}

.btn-quick-bonus {
	background: #374151;
	border: 1px solid #3f3f46;
	color: #e4e4e7;
	border-radius: 4px;
	padding: 4px 8px;
	font-size: 0.75rem;
	cursor: pointer;
}

.btn-quick-bonus:hover {
	background: #3f3f46;
}

.roller-divider {
	border: none;
	border-top: 1px solid #27272a;
	margin: 8px 0;
}

/* --- Styles pour les sélecteurs de quantité (+ / -) --- */
.dice-count-selector {
	display: flex;
	align-items: center;
	background: #37415180;
	border: 1px solid #27272a;
	border-radius: 8px;
	overflow: hidden;
	width: fit-content;
}

.btn-count {
	background: #374151;
	border: none;
	color: #e4e4e7;
	padding: 8px 12px;
	cursor: pointer;
	font-weight: bold;
	font-size: 1rem;
	transition: background 0.2s ease;
}

.btn-count:hover {
	background: #3f3f46;
	color: #fff;
}

.count-input {
	width: 45px;
	text-align: center;
	background: transparent;
	border: none;
	color: #fff;
	font-weight: bold;
	font-size: 0.95rem;
}

.count-input::-webkit-inner-spin-button,
.count-input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

/* --- Section Formule personnalisée & Bouton Lancer --- */
.custom-formula-row {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin-top: 4px;
}

.formula-input-group {
	display: flex;
	gap: 8px;
}

.formula-input-group .roller-text-input {
	flex: 1;
}

.btn-formula-submit {
	background: linear-gradient(135deg, #2563eb, #3730a3);
	border: 1px solid #6366f1;
	color: #fff;
	font-weight: bold;
	padding: 0 16px;
	border-radius: 8px;
	cursor: pointer;
	transition:
		transform 0.1s ease,
		filter 0.2s ease;
	white-space: nowrap;
}

.btn-formula-submit:hover {
	filter: brightness(1.1);
	transform: translateY(-1px);
}

.qty-wrapper {
	display: flex;
	align-items: center;
	gap: 2px;
}
.qty-label {
	font-size: 0.7rem;
	color: #9ca3af;
}
.qty-input {
	width: 36px;
	background: #111827;
	border: 1px solid #4b5563;
	color: #fff;
	text-align: center;
	border-radius: 4px;
	font-size: 0.75rem;
	padding: 2px;
}

.btn-del {
	background: #991b1b;
	color: #fca5a5;
	border: none;
	border-radius: 4px;
	padding: 4px 6px;
	font-size: 0.7rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
}
.card-textarea {
	width: 100%;
	background: #111827;
	border: 1px solid #374151;
	color: #d1d5db;
	border-radius: 4px;
	padding: 4px;
	font-size: 0.75rem;
	resize: vertical;
	box-sizing: border-box;
}
.empty-hint {
	font-size: 0.7rem;
	color: #6b7280;
	font-style: italic;
	margin-bottom: 8px;
}

.money-section {
	background: #1f2937;
	padding: 8px;
	border-radius: 6px;
	margin-bottom: 12px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	border: 1px solid #374151;
}
.money-title {
	font-size: 0.8rem;
	font-weight: bold;
	color: #f59e0b;
	display: flex;
	align-items: center;
	gap: 4px;
}
.money-input-wrapper {
	display: flex;
	align-items: center;
	gap: 6px;
}
.money-input {
	width: 60px;
	font-size: 0.9rem;
}
.money-unit {
	font-size: 0.75rem;
	color: #fcd34d;
	font-weight: bold;
}

.gm-section {
	margin-top: 12px;
	padding-top: 8px;
	border-top: 1px solid #374151;
}
.gm-section h3 {
	font-size: 0.8rem;
	margin: 0 0 6px 0;
	display: flex;
	align-items: center;
	gap: 4px;
}
.player-item label {
	font-size: 0.8rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 6px;
}

/* AIDE / TABLEAU DES RÈGLES */
.help-container {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.help-container h3 {
	font-size: 0.95rem;
	margin: 0;
	color: #f3f4f6;
}
.help-subtitle {
	font-size: 0.75rem;
	color: #9ca3af;
	margin: 0 0 8px 0;
}
.table-wrapper {
	width: 100%;
	overflow-x: auto;
}
.rules-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.68rem;
	text-align: center;
}
.rules-table th {
	background: #111827;
	color: #38bdf8;
	padding: 6px 4px;
	border: 1px solid #374151;
	white-space: nowrap;
}
.rules-table td {
	background: #111827;
	color: #d1d5db;
	padding: 6px 4px;
	border: 1px solid #374151;
	white-space: nowrap;
}
.rules-table tr:hover td {
	background: #2d3748;
}

.rank-pill {
	display: inline-block;
	padding: 2px 6px;
	border-radius: 4px;
	font-weight: bold;
	font-size: 0.7rem;
}
.rank-e {
	background: #374151;
	color: #e5e7eb;
}
.rank-d {
	background: #1e3a8a;
	color: #93c5fd;
}
.rank-c {
	background: #065f46;
	color: #a7f3d0;
}
.rank-b {
	background: #78350f;
	color: #fde68a;
}
.rank-a {
	background: #7c2d12;
	color: #fed7aa;
}
.rank-s {
	background: #831843;
	color: #fbcfe8;
}
.rank-m {
	background: #581c87;
	color: #e9d5ff;
}
.rank-h {
	background: #311042;
	color: #f472b6;
	border: 1px solid #ec4899;
}

/* RESTRICTED CARD */
.restricted-card {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 250px;
	background: #111827;
	border: 1px solid #7f1d1d;
}
.restricted-content {
	text-align: center;
	padding: 20px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
}
.restricted-icon-svg {
	color: #f87171;
}
.restricted-content h3 {
	margin: 0;
	font-size: 1rem;
	color: #f87171;
}
.restricted-content p {
	margin: 0;
	font-size: 0.75rem;
	color: #9ca3af;
	max-width: 250px;
	line-height: 1.3;
}

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}
input[type='number'] {
	-moz-appearance: textfield;
}

.chat-container {
	display: flex;
	flex-direction: column;
	height: 100%;
	gap: 10px;
	flex: 1;
}

.chat-btn-formula-submit {
	background: linear-gradient(135deg, #4f46e5, #3730a3);
	border: 1px solid #6366f1;
	color: #fff;
	font-weight: bold;
	padding: 8px 16px;
	border-radius: 8px;
	cursor: pointer;
	transition:
		transform 0.1s ease,
		filter 0.2s ease;
	white-space: nowrap;
}

.chat-messages-box {
	flex: 1;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-height: 500px;
	max-height: 500px;
}

.chat-empty {
	color: #71717a;
	text-align: center;
	margin-top: auto;
	margin-bottom: auto;
	font-size: 0.85rem;
	font-style: italic;
	min-height: 600px;
}

.chat-message {
	background: #27272a;
	border-radius: 6px;
	padding: 8px 10px;
	font-size: 0.9rem;
	border-left: 3px solid transparent;
}

.chat-message.chat-whisper {
	background: #2e1065;
	border-left-color: #8b5cf6;
}

.chat-message-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 4px;
	font-size: 0.75rem;
}

.chat-author {
	font-weight: bold;
}

.chat-time {
	color: #a1a1aa;
}

.badge-whisper {
	color: #c084fc;
	font-weight: bold;
}

.chat-text {
	color: #f4f4f5;
	word-break: break-word;
}

.chat-input-area {
	display: flex;
	gap: 8px;
	align-items: center;
	width: 100%;
	position: relative;
}

.chat-input-container {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
}

/* Fenêtre flottante de suggestions (positionnée au-dessus de l'input) */
.command-suggestions {
	position: absolute;
	bottom: 100%;
	left: 0;
	right: 0;
	margin-bottom: 6px;
	background: #111827;
	border: 1px solid #374151;
	border-radius: 6px;
	max-height: 220px;
	overflow-y: auto;
	box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.5);
	z-index: 100;
	display: flex;
	flex-direction: column;
}

.suggestion-item {
	padding: 8px 10px;
	border-bottom: 1px solid #1f2937;
	cursor: pointer;
	transition: background 0.15s ease;
}

.suggestion-item:last-child {
	border-bottom: none;
}

.suggestion-item:hover,
.suggestion-item.active {
	background: #1f2937;
}

.suggestion-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 2px;
}

.cmd-name {
	font-weight: bold;
	color: #38bdf8;
	font-size: 0.85rem;
}

.cmd-syntax {
	font-size: 0.75rem;
	color: #9ca3af;
	font-family: monospace;
}

.cmd-desc {
	font-size: 0.75rem;
	color: #d1d5db;
	line-height: 1.2;
}

.cmd-example {
	font-size: 0.7rem;
	color: #6b7280;
	margin-top: 3px;
}

.cmd-example code {
	color: #fcd34d;
	background: #374151;
	padding: 1px 4px;
	border-radius: 3px;
}

.chat-whisper-checkbox {
	font-size: 0.75rem;
	color: #a1a1aa;
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	white-space: nowrap;
}

.chat-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid #374151;
	padding-bottom: 8px;
}
.chat-header h3 {
	font-size: 0.9rem;
	margin: 0;
	color: #f3f4f6;
}

.log-card {
	background: #111827;
	border-radius: 6px;
	padding: 8px;
	border-left: 4px solid #6b7280;
}
.log-card.is-success {
	border-left-color: #10b981;
}
.log-card.is-fail {
	border-left-color: #ef4444;
}
.log-card.is-crit-success {
	border-left-color: #f59e0b;
	background: rgba(245, 158, 11, 0.1);
}
.log-card.is-crit-fail {
	border-left-color: #881337;
	background: rgba(136, 19, 55, 0.2);
}
.log-card.is-secret-card {
	background: #1e1b4b;
	border-left-color: #818cf8;
}

.log-top {
	display: flex;
	justify-content: space-between;
	font-size: 0.7rem;
	margin-bottom: 4px;
}
.log-top-right {
	display: flex;
	align-items: center;
	gap: 6px;
}
.player-tag {
	font-weight: bold;
}
.time {
	color: #6b7280;
}
.secret-badge {
	background: #4338ca;
	color: #c7d2fe;
	padding: 1px 4px;
	border-radius: 3px;
	font-size: 0.65rem;
	font-weight: bold;
}

.log-content {
	display: flex;
	justify-content: space-between;
	align-items: center;
}
.log-label {
	font-size: 0.8rem;
	font-weight: bold;
	color: #e5e7eb;
	margin-right: 16px;
}
.log-result-box {
	display: flex;
	align-items: baseline;
	gap: 4px;
}
.dice-val {
	font-size: 1.2rem;
	font-weight: bold;
	color: #fff;
}
.versus {
	font-size: 0.75rem;
	color: #9ca3af;
}

.log-details {
	font-size: 0.7rem;
	color: #9ca3af;
	margin-top: 2px;
	font-style: italic;
}

.log-status {
	margin-top: 4px;
	text-align: right;
}
.status-badge {
	font-size: 0.65rem;
	font-weight: bold;
	padding: 2px 6px;
	border-radius: 3px;
	text-transform: uppercase;
}
.status-badge.success {
	background: #065f46;
	color: #a7f3d0;
}
.status-badge.fail {
	background: #7f1d1d;
	color: #fecaca;
}
.status-badge.crit-success {
	background: #d97706;
	color: #fef3c7;
}
.status-badge.crit-fail {
	background: #881337;
	color: #fecdd3;
}

.gm-dashboard-container {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 10px;
}

.gm-dashboard-container p {
	font-size: 0.75rem;
	color: #9ca3af;
	margin: 0;
	padding-bottom: 4px;
	border-bottom: 1px dashed #9ca3af;
}

.gm-global-infos {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	margin-bottom: 32px;
}

.party-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 10px;
	max-height: 450px;
	overflow-y: auto;
}

.party-card {
	background: #374151;
	border: 1px solid #27272a;
	border-radius: 8px;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.party-char-dying {
	background: #7f1d1d60;
}
.party-char-dead {
	text-decoration: line-through !important;
}

.party-card-header {
	border-bottom: 1px solid #27272a;
	padding-bottom: 6px;
	display: flex;
	justify-content: space-between;
}

.party-char-name {
	font-weight: bold;
	font-size: 0.95rem;
	color: #f4f4f5;
	display: block;
}

.party-player-name {
	font-size: 0.75rem;
	color: #a1a1aa;
}

.party-card-stats {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.85rem;
}

.stat-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.hp-quick-buttons {
	display: flex;
	gap: 4px;
}

.btn-hp-mod {
	background: #2d3748;
	border: 1px solid #3f3f46;
	color: #fff;
	padding: 2px 6px;
	border-radius: 4px;
	cursor: pointer;
	font-size: 0.75rem;
}

.btn-hp-mod:hover {
	background: #3f3f46;
}

.monster-card {
	background: #374151;
}

.combat-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 0.8rem;
	margin-top: 4px;
}

.combat-inputs {
	display: flex;
	align-items: center;
	gap: 2px;
}

.combat-inputs .num-input {
	width: 34px;
	font-size: 0.75rem;
	padding: 1px;
}
</style>
