<?php

declare(strict_types=1);

namespace OCA\DeckCraft\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Co-editing: which SlideLogic build each member runs, and the newest one in each session
 * (`CollabService::requireMember`): a member on an older build rejoins with the new one rather
 * than misread edits it doesn't know.
 */
class Version000400Date20261018190000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();
		$changed = false;
		foreach (['deckcraft_sessions', 'deckcraft_members'] as $name) {
			if (!$schema->hasTable($name)) {
				continue;
			}
			$t = $schema->getTable($name);
			if (!$t->hasColumn('build')) {
				$t->addColumn('build', Types::STRING, ['notnull' => false, 'length' => 32]);
				$changed = true;
			}
		}
		return $changed ? $schema : null;
	}
}
