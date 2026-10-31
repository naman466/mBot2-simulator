<script lang="ts">
	export let size = 30;
</script>

<!-- The app mark: a friendly robot face on a blue tile. -->
<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
	<defs>
		<linearGradient id="logo-tile" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#3b82f6" />
			<stop offset="1" stop-color="#1d4ed8" />
		</linearGradient>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#logo-tile)" />
	<rect x="7" y="10" width="18" height="14" rx="4" fill="#fff" />
	<rect x="15" y="5.5" width="2" height="4.5" rx="1" fill="#fff" />
	<circle cx="16" cy="5.5" r="1.8" fill="#fde047" />
	<rect x="9.5" y="13" width="13" height="7" rx="3" fill="#0f172a" />
	<circle cx="13" cy="16.5" r="1.7" fill="#38bdf8" />
	<circle cx="19" cy="16.5" r="1.7" fill="#38bdf8" />
	<rect x="5" y="15" width="2" height="5" rx="1" fill="#bfdbfe" />
	<rect x="25" y="15" width="2" height="5" rx="1" fill="#bfdbfe" />
</svg>
