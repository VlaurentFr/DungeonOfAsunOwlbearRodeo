<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useOwlbear } from './composables/useOwlbear';
import DiceLogOverlay from './components/DiceLogOverlay.vue';
import { type StatName, type WeaponType, getRankFromXp, SPECIES_DATA } from './types/character';

// Importation des icônes propres depuis Lucide (avec CheckCircle2 et XCircle)
import {
	Scroll,
	Dices,
	ClipboardList,
	BookOpen,
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
} from 'lucide-vue-next';

// Onglet principal
const activeTab = ref<'sheet' | 'roller' | 'logs' | 'help'>('sheet');

// Sous-onglets internes de la fiche
const activeSubTab = ref<'favorites' | 'weapons' | 'spells' | 'armors' | 'masteries' | 'feats' | 'inventory'>(
	'favorites',
);

// Gestion des descriptions dépliées dans l'onglet favoris (Stocke les états par ID unique)
const expandedFavorites = ref<Record<string, boolean>>({});

function toggleFavoriteDesc(id: string) {
	expandedFavorites.value[id] = !expandedFavorites.value[id];
}

// Paramètres du lanceur de dés libre
const customDiceType = ref<number>(20);
const customRollMode = ref<'normal' | 'advantage' | 'disadvantage'>('normal');
const customBonus = ref<number>(0);
const customLabel = ref<string>('');
const isRollSecret = ref<boolean>(false);

const {
	isReady,
	isGM,
	canEdit,
	selectedTokenId,
	sheet,
	roomPlayers,
	rollLogs,
	currentSpeciesData,
	estimatedHpMax,
	estimatedPeMax,
	dodgePenalty,
	protectionPenalty,
	corruptionStatus,
	init,
	saveSheet,
	rollStatCheck,
	rollWeaponAttack,
	rollWeaponDamage,
	rollSpellCast,
	rollSpellEffect,
	rollCustomDice,
	clearLogs,
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
	applyEstimatedHpMax,
	applyEstimatedPeMax,
	toggleWound,
	updateHp,
	updatePe,
	toggleOwner,
	handleUseConsumable,
} = useOwlbear();

const statLabels: Record<StatName, string> = {
	force: 'Force',
	dexterite: 'Dextérité',
	intellect: 'Intellect',
	sagesse: 'Sagesse',
};

const weaponList: WeaponType[] = ['Epee', 'Dague', 'Arc', 'Masse', 'Lance', 'Magie', 'Hache', 'Poing'];

function executeCustomRoll(dice: number) {
	customDiceType.value = dice;
	rollCustomDice(customDiceType.value, customRollMode.value, customBonus.value, customLabel.value, isRollSecret.value);
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

onMounted(() => {
	init();
});
</script>

<template>
	<div class="app-container">
		<!-- NAVIGATION PRINCIPALE -->
		<div class="tabs-navigation">
			<button
				class="tab-btn"
				:class="{ active: activeTab === 'sheet' }"
				@click="activeTab = 'sheet'"
			>
				<Scroll :size="16" /> Fiche
			</button>
			<button
				class="tab-btn"
				:class="{ active: activeTab === 'roller' }"
				@click="activeTab = 'roller'"
			>
				<Dices :size="16" /> Lanceur
			</button>
			<button
				class="tab-btn"
				:class="{ active: activeTab === 'logs' }"
				@click="activeTab = 'logs'"
			>
				<ClipboardList :size="16" /> Logs
				<span
					v-if="rollLogs.length > 0"
					class="tab-badge"
					>{{ rollLogs.length }}</span
				>
			</button>
			<button
				class="tab-btn"
				:class="{ active: activeTab === 'help' }"
				@click="activeTab = 'help'"
			>
				<BookOpen :size="16" /> Aide Maîtrises
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
			<div
				v-if="!selectedTokenId"
				class="status-msg"
			>
				👉 Sélectionnez un pion sur la carte pour afficher sa fiche.
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
				:class="{ 'sheet-dead': sheet.wounds.filter((w) => w).length === 6, 'sheet-corrupted': sheet.corruption >= 20 }"
			>
				<!-- BARRE DE MASQUAGE GLOBALE FICHE -->
				<div class="secret-toggle-bar">
					<label class="checkbox-secret-label">
						<input
							type="checkbox"
							v-model="isRollSecret"
						/>
						<Lock :size="14" /> Masquer mes lancers (MJ uniquement)
					</label>
				</div>

				<div class="header">
					<input
						v-model="sheet.name"
						@change="saveSheet"
						class="name-input"
						placeholder="Nom du personnage"
					/>
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
									<button
										@click="applyEstimatedHpMax"
										class="btn-est"
									>
										(Est: {{ estimatedHpMax }})
									</button>
								</div>
							</div>
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
									<button
										@click="applyEstimatedPeMax"
										class="btn-est"
									>
										(Est: {{ estimatedPeMax }})
									</button>
								</div>
							</div>
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
				<h3 class="section-title">Statistiques</h3>
				<div class="stats-grid">
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

				<div class="dodge-banner">
					<div class="dodge-title"><Shield :size="14" /> Indice d'Esquive</div>
					<div class="dodge-text">
						Malus attaquant :
						<span
							class="dodge-val"
							:class="{ 'has-penalty': dodgePenalty < 0 }"
							>{{ dodgePenalty === 0 ? '0' : dodgePenalty }}</span
						>
					</div>
				</div>

				<div class="protection-banner">
					<div class="protection-title"><Shield :size="14" /> Indice de Protection</div>
					<div class="protection-text">
						Bonus protection :
						<span class="protection-val">{{
							protectionPenalty.protection === 0 ? '0' : protectionPenalty.protection
						}}</span>
					</div>

					<div class="protection-title"><Skull :size="14" /> Indice de Malus</div>
					<div class="protection-text">
						Malus dexterité :
						<span
							class="protection-val"
							:class="{ 'has-penalty': protectionPenalty.dexterity < 0 }"
							>{{ protectionPenalty.dexterity === 0 ? '0' : protectionPenalty.dexterity }}</span
						>
					</div>
				</div>

				<div class="equipped-weapons">
					<!-- Armes equipées -->
					<div
						v-for="weapon in sheet.weapons.filter((w) => w.equipped)"
						:key="'fav-w-' + weapon.id"
					>
						<div class="fav-quick-header">
							<span class="fav-quick-type"><Sword :size="12" /> Arme</span>
							<span class="fav-quick-name">{{ weapon.name || 'Arme sans nom' }}</span>
							<div class="fav-quick-actions">
								<button
									@click="rollWeaponAttack(weapon, isRollSecret)"
									class="btn-weapon-roll btn-attack"
								>
									Attaquer
								</button>
								<button
									@click="rollWeaponDamage(weapon, isRollSecret)"
									class="btn-weapon-roll btn-damage"
								>
									Dégâts
								</button>
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

					<!-- Armures equipé -->
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

				<!-- SOUS-ONGLETS INTERNES -->
				<div class="subtabs-navigation">
					<button
						class="subtab-btn fav-tab-btn"
						:class="{ active: activeSubTab === 'favorites' }"
						@click="activeSubTab = 'favorites'"
					>
						<Star
							:size="14"
							class="fav-icon-tab"
						/>
						Favoris
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'weapons' }"
						@click="activeSubTab = 'weapons'"
					>
						Armes ({{ sheet.weapons.length }})
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'spells' }"
						@click="activeSubTab = 'spells'"
					>
						Sorts ({{ sheet.spells.length }})
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'armors' }"
						@click="activeSubTab = 'armors'"
					>
						Armures ({{ sheet.armors.length }})
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'masteries' }"
						@click="activeSubTab = 'masteries'"
					>
						Maîtrises
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'feats' }"
						@click="activeSubTab = 'feats'"
					>
						Dons ({{ sheet.feats.length }})
					</button>
					<button
						class="subtab-btn"
						:class="{ active: activeSubTab === 'inventory' }"
						@click="activeSubTab = 'inventory'"
					>
						Sac ({{ sheet.inventory.length }})
					</button>
				</div>

				<!-- SOUS-ONGLET 0 : FAVORIS -->
				<div
					v-if="activeSubTab === 'favorites'"
					class="subtab-content"
				>
					<h4 class="sub-section-title">⭐ Accès Rapide (Favoris)</h4>
					<div
						v-if="!hasAnyFavorites"
						class="empty-hint"
					>
						Aucun favori sélectionné. Cliquez sur l'étoile (⭐) d'un élément pour l'ajouter ici.
					</div>

					<div
						v-else
						class="favorites-quick-container"
					>
						<!-- Armes favorites -->
						<div
							v-for="weapon in sheet.weapons.filter((w) => w.favorite)"
							:key="'fav-w-' + weapon.id"
							class="fav-quick-card"
						>
							<div class="fav-quick-header">
								<span class="fav-quick-type"><Sword :size="12" /> Arme</span>
								<span class="fav-quick-name">{{ weapon.name || 'Arme sans nom' }}</span>
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
										weapon.favorite = false;
										saveSheet();
									"
									class="btn-remove-fav"
									title="Retirer des favoris"
								>
									<X :size="14" />
								</button>
							</div>
							<div class="fav-quick-actions">
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
								>
									Dégâts ({{ weapon.damage }})
								</button>
							</div>
							<div
								v-if="expandedFavorites['w-' + weapon.id] && weapon.description"
								class="fav-quick-expanded-desc"
							>
								{{ weapon.description }}
							</div>
						</div>

						<!-- Sorts favoris (Mis à jour avec le seuil et la formule) -->
						<div
							v-for="spell in sheet.spells.filter((s) => s.favorite)"
							:key="'fav-s-' + spell.id"
							class="fav-quick-card"
						>
							<div class="fav-quick-header">
								<span class="fav-quick-type"><Wand2 :size="12" /> Sort</span>
								<span class="fav-quick-name">{{ spell.name || 'Sort sans nom' }}</span>
								<span class="fav-quick-info"
									>Portée: {{ spell.range || 'Corps à corps' }} | {{ spell.peCost || 0 }} PE</span
								>
								<button
									v-if="spell.description"
									@click="toggleFavoriteDesc('s-' + spell.id)"
									class="btn-toggle-desc"
									title="Voir la description"
								>
									<component
										:is="expandedFavorites['s-' + spell.id] ? ChevronUp : ChevronDown"
										:size="14"
									/>
								</button>
								<button
									@click="
										spell.favorite = false;
										saveSheet();
									"
									class="btn-remove-fav"
									title="Retirer des favoris"
								>
									<X :size="14" />
								</button>
							</div>
							<div class="fav-quick-actions">
								<button
									@click="rollSpellCast(spell, isRollSecret)"
									class="btn-weapon-roll btn-spell-cast"
								>
									Incanter ({{ sheet.stats[spell.stat || 'intellect'] || 0 }})
								</button>
								<button
									@click="rollSpellEffect(spell, isRollSecret)"
									class="btn-weapon-roll btn-spell-effect"
								>
									Effet ({{ spell.formula || '0' }})
								</button>
							</div>
							<div
								v-if="expandedFavorites['s-' + spell.id] && spell.description"
								class="fav-quick-expanded-desc"
							>
								{{ spell.description }}
							</div>
						</div>

						<!-- Armures favorites -->
						<div
							v-for="armor in sheet.armors.filter((a) => a.favorite)"
							:key="'fav-a-' + armor.id"
							class="fav-quick-card"
						>
							<div class="fav-quick-header">
								<span class="fav-quick-type"><Shield :size="12" /> Armure</span>
								<span class="fav-quick-name">{{ armor.name || 'Armure' }} (Prot: {{ armor.protection || 0 }})</span>
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
										armor.favorite = false;
										saveSheet();
									"
									class="btn-remove-fav"
									title="Retirer des favoris"
								>
									<X :size="14" />
								</button>
							</div>
							<div
								v-if="expandedFavorites['a-' + armor.id] && armor.description"
								class="fav-quick-expanded-desc"
							>
								{{ armor.description }}
							</div>
						</div>

						<!-- Dons favoris -->
						<div
							v-for="feat in sheet.feats.filter((f) => f.favorite)"
							:key="'fav-f-' + feat.id"
							class="fav-quick-card"
						>
							<div class="fav-quick-header">
								<span class="fav-quick-type"><Award :size="12" /> Don</span>
								<span class="fav-quick-name">{{ feat.name || 'Don' }}</span>
								<button
									v-if="feat.effect"
									@click="toggleFavoriteDesc('f-' + feat.id)"
									class="btn-toggle-desc"
									title="Voir la description"
								>
									<component
										:is="expandedFavorites['f-' + feat.id] ? ChevronUp : ChevronDown"
										:size="14"
									/>
								</button>
								<button
									@click="
										feat.favorite = false;
										saveSheet();
									"
									class="btn-remove-fav"
									title="Retirer des favoris"
								>
									<X :size="14" />
								</button>
							</div>
							<div
								v-if="expandedFavorites['f-' + feat.id] && feat.effect"
								class="fav-quick-expanded-desc"
							>
								{{ feat.effect }}
							</div>
						</div>

						<!-- Objets inventaire favoris -->
						<div
							v-for="item in sheet.inventory.filter((i) => i.favorite)"
							:key="'fav-i-' + item.id"
							class="fav-quick-card"
						>
							<div class="fav-quick-header">
								<span class="fav-quick-type"><Backpack :size="12" /> Objet (x{{ item.quantity ?? 1 }})</span>
								<span class="fav-quick-name">{{ item.name || 'Objet' }}</span>
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
								<button
									v-if="item.description"
									@click="toggleFavoriteDesc('i-' + item.id)"
									class="btn-toggle-desc"
									title="Voir la description"
								>
									<component
										:is="expandedFavorites['i-' + item.id] ? ChevronUp : ChevronDown"
										:size="14"
									/>
								</button>
								<button
									@click="
										item.favorite = false;
										saveSheet();
									"
									class="btn-remove-fav"
									title="Retirer des favoris"
								>
									<X :size="14" />
								</button>
							</div>
							<div
								v-if="item.formula"
								class="fav-quick-desc"
							>
								<span class="formula-tag">Formule : {{ item.formula }}</span>
							</div>
							<div
								v-if="expandedFavorites['i-' + item.id] && item.description"
								class="fav-quick-expanded-desc"
							>
								{{ item.description }}
							</div>
						</div>
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
									<X :size="14" />
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
								>
									Dégâts ({{ weapon.damage }})
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
									<X :size="14" />
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
								>
									Effet ({{ spell.formula || '0' }})
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
									<X :size="14" />
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
									<X :size="14" />
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
									<X :size="14" />
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
									v-if="item.formula"
									@click="consumeItem(item)"
									class="btn-use-item"
									title="Consommer et lancer le dé"
								>
									<Play :size="10" /> Utiliser (-1)
								</button>
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
					<h3><Key :size="14" /> Restreindre l'accès</h3>
					<div class="players-list">
						<div
							v-for="player in roomPlayers"
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
				<h3>Lanceur de Dés Personnalisé</h3>

				<div class="roller-row">
					<label class="roller-label">Libellé du jet :</label>
					<input
						type="text"
						v-model="customLabel"
						class="roller-text-input"
						placeholder="Ex: Jet de compétence, Test..."
					/>
				</div>

				<div class="roller-row">
					<label class="roller-label">Mode :</label>
					<div class="radio-group">
						<label
							><input
								type="radio"
								value="normal"
								v-model="customRollMode"
							/>
							Normal</label
						>
						<label
							><input
								type="radio"
								value="advantage"
								v-model="customRollMode"
							/>
							Avantage</label
						>
						<label
							><input
								type="radio"
								value="disadvantage"
								v-model="customRollMode"
							/>
							Désavantage</label
						>
					</div>
				</div>

				<div class="roller-row">
					<label class="roller-label">Bonus / Malus :</label>
					<input
						type="number"
						v-model.number="customBonus"
						class="num-input roller-bonus-input"
					/>
				</div>

				<div class="roller-row">
					<label class="checkbox-secret-label">
						<input
							type="checkbox"
							v-model="isRollSecret"
						/>
						<Lock :size="14" /> Masquer ce lancer (MJ uniquement)
					</label>
				</div>

				<h4 class="roller-subtitle">Choisissez votre dé à lancer :</h4>
				<div class="dice-buttons-grid">
					<button
						@click="executeCustomRoll(4)"
						class="btn-dice"
					>
						d4
					</button>
					<button
						@click="executeCustomRoll(6)"
						class="btn-dice"
					>
						d6
					</button>
					<button
						@click="executeCustomRoll(8)"
						class="btn-dice"
					>
						d8
					</button>
					<button
						@click="executeCustomRoll(10)"
						class="btn-dice"
					>
						d10
					</button>
					<button
						@click="executeCustomRoll(12)"
						class="btn-dice"
					>
						d12
					</button>
					<button
						@click="executeCustomRoll(20)"
						class="btn-dice btn-dice-main"
					>
						d20
					</button>
					<button
						@click="executeCustomRoll(100)"
						class="btn-dice"
					>
						d100
					</button>
				</div>
			</div>
		</div>

		<!-- ONGLET 3 : LOGS -->
		<div
			v-else-if="activeTab === 'logs'"
			class="sheet-card"
		>
			<DiceLogOverlay
				:logs="rollLogs"
				@clear="clearLogs"
			/>
		</div>

		<!-- ONGLET 4 : AIDE / RÈGLES -->
		<div
			v-else-if="activeTab === 'help'"
			class="sheet-card"
		>
			<div class="help-container">
				<h3>Tableau de Progression des Maîtrises</h3>
				<p class="help-subtitle">Récapitulatif des bonus obtenus selon le rang et l'XP accumulée dans une maîtrise.</p>

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
	</div>
</template>

<style scoped>
.app-container {
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
	color: #f3f4f6;
	padding: 10px;
	box-sizing: border-box;
}
.tabs-navigation {
	display: flex;
	gap: 6px;
	margin-bottom: 12px;
	border-bottom: 2px solid #374151;
	padding-bottom: 4px;
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
	margin-bottom: 10px;
	display: flex;
	align-items: center;
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
	margin-bottom: 48px;
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

.equipped-weapons {
	padding: 6px 8px;
	border-radius: 8px;
	background-color: #111827;
	margin-bottom: 48px;
	display: flex;
	flex-direction: column;
	gap: 16px;
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
	margin-bottom: 48px;
	margin-top: 48px;
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
	cursor: pointer;
}

.bar-background {
	background: #374151;
	height: 6px;
	border-radius: 3px;
	overflow: hidden;
	margin-bottom: 4px;
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
	/* border-bottom: 1px dotted #9ca3af; */
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
}
.fav-quick-actions {
	display: flex;
	gap: 6px;
	margin-top: 2px;
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
}
.btn-weapon-roll {
	flex: 1;
	border: none;
	border-radius: 4px;
	padding: 4px 6px;
	font-size: 0.7rem;
	font-weight: bold;
	cursor: pointer;
	color: white;
}
.btn-attack {
	background: #2563eb;
}
.btn-attack:hover {
	background: #1d4ed8;
}
.btn-damage {
	background: #dc2626;
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
	background: #059669;
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
.roller-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
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
	padding: 6px;
	font-size: 0.8rem;
	width: 100%;
	box-sizing: border-box;
}
.radio-group {
	display: flex;
	gap: 12px;
	font-size: 0.8rem;
	color: #d1d5db;
}
.radio-group label {
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
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
	transition: background 0.1s ease;
}
.btn-dice:hover {
	background: #4b5563;
	border-color: #60a5fa;
}
.btn-dice-main {
	background: #2563eb;
	border-color: #3b82f6;
}
.btn-dice-main:hover {
	background: #1d4ed8;
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
	color: white;
	border: none;
	border-radius: 4px;
	padding: 2px 6px;
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
</style>
