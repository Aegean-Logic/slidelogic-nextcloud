<?php

declare(strict_types=1);

namespace OCA\DeckCraft\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Files_Sharing\Event\BeforeTemplateRenderedEvent;
use OCA\DeckCraft\Listener\LoadFilesScripts;
use OCA\DeckCraft\Listener\LoadPublicFolderScripts;
use OCA\DeckCraft\Share\EditorPageProvider;
use OCP\App\IAppManager;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'deckcraft';

	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	public function register(IRegistrationContext $context): void {
		// The Files app loads our "Open in SlideLogic" action.
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScripts::class);
		// A shared link to a presentation opens in SlideLogic.
		$context->registerPublicShareTemplateProvider(EditorPageProvider::class);
		// A link to a folder: its presentations open in SlideLogic too.
		$context->registerEventListener(BeforeTemplateRenderedEvent::class, LoadPublicFolderScripts::class);
	}

	public function boot(IBootContext $context): void {
	}

	/** Whether the SlideLogic web build is in `editor/` (it's vendored separately: editor/README.md). */
	public static function editorInstalled(IAppManager $appManager): bool {
		return is_file($appManager->getAppPath(self::APP_ID) . '/editor/index.html');
	}
}
