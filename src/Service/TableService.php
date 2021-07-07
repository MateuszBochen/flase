<?php

namespace App\Service;

use App\ViewObject\Column;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception;

/**
 * class TableService
 * @package ${NAMESPACE}
 * @author Mateusz Bochen
 */
class TableService
{
    /**
     * @return Column[]
     * @throws Exception
     */
    public function getTableColumns(Connection $connection, string $databaseName, string $tableName): array
    {
        $sql = "SHOW COLUMNS FROM `$tableName`";
        $stmt = $connection->executeQuery($sql);
        $columns = $stmt->fetchAllAssociative();
        $references = $this->getReferencesColumns($connection, $databaseName, $tableName);
        $returnObjects = [];

        foreach ($columns as $column) {

            $referencesColumn = $this->findReferences($column['Field'], $references);

            $returnObjects[] = new Column(
                $column['Field'],
                $column['Default'],
                $column['Type'],
                $column['Key'] === 'PRI',
                $column['Extra'] === 'auto_increment',
                $column['Null'] === 'YES',
                $referencesColumn[0],
                $referencesColumn[1]
            );
        }

        return $returnObjects;
    }

    public function getReferencesColumns(Connection $connection, string $databaseName, string $tableName):array
    {
        $sql = "SELECT
            `COLUMN_NAME`,
            `REFERENCED_TABLE_NAME`,
            `REFERENCED_COLUMN_NAME`
            FROM `INFORMATION_SCHEMA`.`KEY_COLUMN_USAGE`
            WHERE 
                `TABLE_SCHEMA` = :databaseName
                AND `TABLE_NAME` = :tableName
                AND `REFERENCED_TABLE_NAME` IS NOT NULL
                    
          ";

        $stmt = $connection->executeQuery($sql, [
            'databaseName' => $databaseName,
            'tableName' => $tableName,
        ]);
        return $stmt->fetchAllAssociative();
    }


    private function findReferences(string $columnName, array &$list)
    {
        foreach ($list as $item) {
            if ($columnName === $item['COLUMN_NAME']) {
                return [$item['REFERENCED_TABLE_NAME'], $item['REFERENCED_COLUMN_NAME']];
            }
        }

        return ['', ''];
    }
}
