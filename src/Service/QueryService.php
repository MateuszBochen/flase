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

        $connection->executeQuery("SET profiling = 1");
        $data = $this->executeQuery($connection, $query);
        $profiles = $this->executeQuery($connection, "SHOW PROFILES");
        $profile = [
            'Duration' => 0.0,
        ];
        if (count($profiles)) {
            $profile = reset($profiles);
        }

        if (!count($data)) {
            if (count($columns)) {
                return [
                    'columns' => $columns,
                    'records' => [],
                    'total' => 0,
                    'queryTime' => $profile['Duration'],
                    'profile' => $profiles,
                ];
            } else {
                return [
                    'columns' => [],
                    'records' => [],
                    'total' => 0,
                    'queryTime' => $profile['Duration'],
                    'profile' => $profiles,
                ];
            }
        }

        return [
            'columns' => $this->matchColumns($data, $columns),
            'records' => $data,
            'total' => $this->countQuery($connection, $query),
            'queryTime' => $profile['Duration'],
            'profile' => $profiles,
        ];
    }

    private function countQuery(Connection $connection, string $query):int
    {
        try {
            $explodeQuery = explode(' FROM ', $query);
            unset($explodeQuery[0]);

            $stringQuery = implode(' FROM ', $explodeQuery);
            $stringQuery = explode(' LIMIT ', $stringQuery);

            if (count($stringQuery) > 1) {
                unset($stringQuery[count($stringQuery) - 1]);
                $stringQuery = implode(' LIMIT ', $stringQuery);
            } else {
                $stringQuery = $stringQuery[0];
            }

            $selectQuery = "SELECT COUNT(*) FROM $stringQuery";
            $stmt = $connection->executeQuery($selectQuery);
            $data = $stmt->fetchNumeric();
            return (int)reset($data);
        } catch (\Exception $e) {
            return 0;
        }
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
