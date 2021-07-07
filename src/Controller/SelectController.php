<?php

namespace App\Controller;

use App\Service\QueryService;

use Doctrine\DBAL\DriverManager;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Symfony\Component\Serializer\SerializerInterface;


/**
 * class TableController
 * @package ${NAMESPACE}
 * @author Mateusz Bochen
 */
class SelectController
{
    #[Route('/api/select/get-data', name: 'select_get_data', methods: ['post'])]
    public function getTableDate(Request $request, QueryService $queryService, SerializerInterface $serializer): JsonResponse
    {

        $host = $request->get('host');
        $login = $request->get('login');
        $password = $request->get('password');
        $databaseName = $request->get('databaseName');
        $query = $request->get('query');

        $connectionParams = [
            'driver' => 'pdo_mysql',
        ];

        if ($host) {
            $connectionParams['host'] = $host;
        }

        if ($password) {
            $connectionParams['password'] = $password;
        }

        if ($databaseName) {
            $connectionParams['dbname'] = $databaseName;
        }

        if ($login) {
            $connectionParams['user'] = $login;
        } else {
            return new JsonResponse(['message' => 'error', 'data' => 'Invalid User name'], Response::HTTP_UNAUTHORIZED);
        }

        $matches = [];
        preg_match("/\bFROM\b\s`?([a-zA-Z-_]+)`?\s?/im", $query, $matches);

        $tableName = null;

        if (isset($matches[1])) {
            $tableName = $matches[1];
        }

        //return new JsonResponse(['message' => 'ok', 'data' => $matches], Response::HTTP_OK);

        try {
            $conn = DriverManager::getConnection($connectionParams);
            if ($tableName) {
                $data = $queryService->select($conn, $databaseName, $query);
                $array = $serializer->serialize($data, 'json');
                return new JsonResponse(['message' => 'ok', 'data' => json_decode($array)], Response::HTTP_OK);
            }

        } catch (\Exception $exception) {
            return new JsonResponse(
                [
                    'message' => 'error',
                    'data' => [
                        'error' => $exception->getMessage(),
                        'sql' => $query,
                        'table' => $tableName
                    ]
                ],
                Response::HTTP_INTERNAL_SERVER_ERROR
            );
        }

        return new JsonResponse();
    }
}
