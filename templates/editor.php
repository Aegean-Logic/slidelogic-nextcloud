<?php
/** @var array $_ */
?>
<div id="deckcraft-app"
	data-path="<?php p($_['path']); ?>"
	data-editor-url="<?php p($_['editorUrl']); ?>"
	data-editor-missing="<?php p(!empty($_['editorMissing']) ? '1' : '0'); ?>">
	<p id="deckcraft-status">Loading SlideLogic…</p>
	<p id="deckcraft-notice" role="status" hidden></p>
</div>
