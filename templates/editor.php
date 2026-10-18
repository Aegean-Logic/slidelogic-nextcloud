<?php
/** @var array $_ */
?>
<div id="deckcraft-app"
	data-path="<?php p($_['path']); ?>"
	data-file-id="<?php p((string)$_['fileId']); ?>"
	<?php if (isset($_['shareToken'])) { ?>
	data-share-token="<?php p($_['shareToken']); ?>"
	data-share-path="<?php p($_['sharePath'] ?? ''); ?>"
	data-file-name="<?php p($_['fileName']); ?>"
	data-can-edit="<?php p($_['canEdit'] ? '1' : '0'); ?>"
	<?php } ?>
	data-editor-url="<?php p($_['editorUrl']); ?>"
	data-editor-missing="<?php p(!empty($_['editorMissing']) ? '1' : '0'); ?>">
	<p id="deckcraft-status">Loading SlideLogic…</p>
	<p id="deckcraft-notice" role="status" hidden></p>
</div>
