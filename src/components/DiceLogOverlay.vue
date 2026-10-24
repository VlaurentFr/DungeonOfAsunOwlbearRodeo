<script setup lang="ts">
import type { DiceRollLog } from '../types/character';

defineProps<{
	logs: DiceRollLog[];
}>();

const emit = defineEmits(['clear']);
</script>

<template>
	<div class="logs-container">
		<div class="logs-header">
			<h3>Historique des Lancers</h3>
			<button
				v-if="logs.length > 0"
				@click="emit('clear')"
				class="btn-clear"
			>
				Effacer
			</button>
		</div>

		<div class="logs-list">
			<div
				v-if="logs.length === 0"
				class="no-logs"
			>
				Aucun jet de dés visible.
			</div>

			<div
				v-for="log in logs"
				:key="log.id"
				class="log-card"
				:class="{
					'is-crit-success': log.isCritSuccess,
					'is-crit-fail': log.isCritFailure,
					'is-success': log.isSuccess === true,
					'is-fail': log.isSuccess === false,
					'is-secret-card': log.isSecret,
				}"
			>
				<div class="log-top">
					<span
						class="player-tag"
						:style="{ color: log.playerColor }"
					>
						● {{ log.playerName }} ({{ log.characterName }})
					</span>
					<div class="log-top-right">
						<span
							v-if="log.isSecret"
							class="secret-badge"
							>Secret</span
						>
						<span class="time">{{ log.timestamp }}</span>
					</div>
				</div>

				<div class="log-content">
					<span class="log-label">{{ log.label }}</span>

					<div class="log-result-box">
						<span class="dice-val">{{ log.diceResult }}</span>
						<span
							v-if="log.statValue !== undefined"
							class="versus"
							>vs {{ log.statValue }}</span
						>
					</div>
				</div>

				<div
					v-if="log.details"
					class="log-details"
				>
					{{ log.details }}
				</div>

				<div
					v-if="log.isSuccess !== undefined"
					class="log-status"
				>
					<span
						v-if="log.isCritSuccess"
						class="status-badge crit-success"
						>CRITIQUE !</span
					>
					<span
						v-else-if="log.isCritFailure"
						class="status-badge crit-fail"
						>ÉCHEC CRITIQUE !</span
					>
					<span
						v-else-if="log.isSuccess"
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
	</div>
</template>

<style scoped>
.logs-container {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.logs-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	border-bottom: 1px solid #374151;
	padding-bottom: 8px;
}
.logs-header h3 {
	font-size: 0.9rem;
	margin: 0;
	color: #f3f4f6;
}
.btn-clear {
	background: #374151;
	color: #d1d5db;
	border: none;
	border-radius: 4px;
	padding: 3px 8px;
	font-size: 0.75rem;
	cursor: pointer;
}
.btn-clear:hover {
	background: #4b5563;
}
.logs-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.no-logs {
	font-size: 0.8rem;
	color: #6b7280;
	text-align: center;
	padding: 20px 0;
	font-style: italic;
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
</style>
