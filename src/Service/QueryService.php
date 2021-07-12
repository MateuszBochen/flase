<?php


namespace App\Service;

use App\ViewObject\Column;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception;

/**
 * class QueryService
 * @package App\Service
 * @author Mateusz Bochen
 */
class QueryService
{



    public function __construct(private TableService $tableService)
    {
    }

    public function select(Connection $connection, string $databaseName, string $query): array
    {
        $tableName = $this->getTableNameFrom($query);
        $columns = [];
        if ($tableName) {
            $columns = $this->tableService->getTableColumns($connection, $databaseName, $tableName);
        }
        $microTimeStart = microtime(true);
        $data = $this->executeQuery($connection, $query);
        $microTimeEnd = microtime(true);

        $queryTime = $microTimeEnd - $microTimeStart;

        if (!count($data)) {
            if (count($columns)) {
                return [
                    'columns' => $columns,
                    'records' => [],
                    'total' => 0,
                    'queryTime' => $queryTime,
                ];
            } else {
                return [
                    'columns' => [],
                    'records' => [],
                    'total' => 0,
                    'queryTime' => $queryTime,
                ];
            }
        }


        return [
            'columns' => $this->matchColumns($data, $columns),
            'records' => $data,
            'total' => $this->countQuery($connection, $query),
            'queryTime' => $queryTime,
        ];
    }

    private function countQuery(Connection $connection, string $query):int
    {
        $explodeQuery = explode(' FROM ', $query);
        unset($explodeQuery[0]);

        $stringQuery = implode(' FROM ', $explodeQuery);
        $stringQuery = explode(' LIMIT ', $stringQuery);

        if (count($stringQuery) > 1) {
            unset($stringQuery[count($stringQuery)-1]);
            $stringQuery = implode(' LIMIT ', $stringQuery);
        } else {
            $stringQuery = $stringQuery[0];
        }

        $selectQuery = "SELECT COUNT(*) FROM $stringQuery";
        $stmt = $connection->executeQuery($selectQuery);
        $data = $stmt->fetchNumeric();
        return (int)reset($data);
    }

    /**
     * @throws Exception
     */
    private function executeQuery(Connection $connection, string $query): array
    {
        $stmt = $connection->executeQuery($query);
        return $stmt->fetchAllAssociative();
    }

    /**
     * @param array $data
     * @param Column[] $columns
     * @return array
     */
    private function matchColumns(array &$data, array &$columns): array
    {
        $firstRow = reset($data);
        $newColumns = [];

        foreach ($firstRow as $columnName => $value) {
            $isFind = false;

            foreach ($columns as $columnObject) {
                if ($columnName === $columnObject->getName()) {
                    $isFind = true;
                    $newColumns[] = $columnObject;
                    break;
                }
            }
            if (!$isFind) {
                $newColumns[] = $columnName;
            }
        }

        return $newColumns;
    }

    private function getTableNameFrom(string $query):?string
    {
        $matches = [];
        preg_match("/\bFROM\b\s`?([a-zA-Z-_]+)`?\s?/im", $query, $matches);

        $tableName = null;

        if (isset($matches[1])) {
            $tableName = $matches[1];
        }

        return $tableName;
    }
}
