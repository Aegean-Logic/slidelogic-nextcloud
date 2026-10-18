<?php

declare(strict_types=1);

namespace OCA\DeckCraft\Listener;

use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\DeckCraft\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Util;

/**
 * A link to a folder: the folder's page (Nextcloud's Files app, public) gets the "Open in
 * SlideLogic" action, which opens a presentation there through the link
 * (`Controller\PublicEditorController`).
 *
 * @template-implements IEventListener<BeforeTemplateRenderedEvent>
 */
class LoadPublicFolderScripts implements IEventListener {
	public function handle(Event $event): void {
		// The password page has no files to open.
		if (!$event instanceof BeforeTemplateRenderedEvent || $event->getScope() !== null) {
			return;
		}
		try {
			$folder = $event->getShare()->getNode() instanceof Folder;
		} catch (NotFoundException) {
			$folder = false;
		}
		if ($folder) {
			Util::addInitScript(Application::APP_ID, 'deckcraft-files');
		}
	}
}
