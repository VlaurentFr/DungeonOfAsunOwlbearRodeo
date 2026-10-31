import { ref } from 'vue';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const session = ref<Session | null>(null);
const user = ref<User | null>(null);
const isLoading = ref(true);
const authError = ref<string | null>(null);

let initialized = false;

export function useAuth() {
	async function initAuth() {
		if (initialized) return;

		initialized = true;

		const { data, error } = await supabase.auth.getSession();

		if (error) {
			authError.value = error.message;
		} else {
			session.value = data.session;
			user.value = data.session?.user ?? null;
		}

		supabase.auth.onAuthStateChange((_event, newSession) => {
			session.value = newSession;
			user.value = newSession?.user ?? null;
		});

		isLoading.value = false;
	}

	async function signIn(email: string, password: string) {
		authError.value = null;
		isLoading.value = true;

		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (error) {
			authError.value = error.message;
			isLoading.value = false;
			return false;
		}

		session.value = data.session;
		user.value = data.user;
		isLoading.value = false;

		return true;
	}

	async function signOut() {
		const { error } = await supabase.auth.signOut();

		if (error) {
			authError.value = error.message;
			return false;
		}

		session.value = null;
		user.value = null;

		return true;
	}

	return {
		session,
		user,
		isLoading,
		authError,
		initAuth,
		signIn,
		signOut,
	};
}
